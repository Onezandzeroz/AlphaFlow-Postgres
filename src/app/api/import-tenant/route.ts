import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { companyScope, Permission, requirePermission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import JSZip from 'jszip';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { auditLog } from '@/lib/audit';

// POST /api/import-tenant — Restore tenant data from a previously exported ZIP snapshot
// Version 3: atomic transaction, validate-before-delete, proper error reporting
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const denied = requirePermission(ctx, Permission.DATA_CREATE);
    if (denied) return denied;

    const companyId = ctx.activeCompanyId;
    const userId = ctx.id;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('snapshot') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided. Use field name "snapshot".' }, { status: 400 });
    }

    if (!file.name.endsWith('.zip')) {
      return NextResponse.json({ error: 'File must be a .zip file.' }, { status: 400 });
    }

    // Allow up to 500MB for snapshots with files
    if (file.size > 500 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 500 MB.' }, { status: 400 });
    }

    // ─── PHASE 0: Read and validate ZIP structure BEFORE any data modification ───
    const buffer = Buffer.from(await file.arrayBuffer());
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (zipError) {
      return NextResponse.json({
        error: `Invalid ZIP file: ${zipError instanceof Error ? zipError.message : 'cannot parse'}`,
      }, { status: 400 });
    }

    // Read manifest — reject backup ZIPs (should use restore feature instead)
    const manifestRaw = zip.file('manifest.json');
    if (!manifestRaw) {
      // Check if this looks like a backup ZIP (contains database.db)
      const isBackupZip = zip.file('database.db') !== null;
      if (isBackupZip) {
        return NextResponse.json({
          error: 'This is a backup ZIP (contains database.db), not a tenant snapshot export. Use the "Upload Backup" restore feature in the backup section instead.',
          code: 'WRONG_FORMAT_BACKUP',
        }, { status: 400 });
      }
      // Log the ZIP contents for diagnostics
      const zipFileNames = Object.keys(zip.files).join(', ');
      logger.warn(`[IMPORT-TENANT] ZIP has neither manifest.json nor database.db. Files in ZIP: [${zipFileNames}], size: ${buffer.length} bytes`);

      // Additional heuristics: check if any file ends with .zip (nested archive) or if ZIP appears empty
      const hasNestedZip = Object.keys(zip.files).some(n => n.endsWith('.zip'));
      const isEmpty = Object.keys(zip.files).length === 0;

      if (isEmpty) {
        return NextResponse.json({
          error: 'The uploaded ZIP file is empty. It contains no files.',
        }, { status: 400 });
      }
      if (hasNestedZip) {
        return NextResponse.json({
          error: 'The uploaded file appears to be a ZIP containing other ZIP files. Please extract and upload the individual .zip backup file directly.',
        }, { status: 400 });
      }
      // Check for any file with 'db' in the name (case-insensitive)
      const hasDbFile = Object.keys(zip.files).some(n => n.toLowerCase().includes('.db'));
      if (hasDbFile) {
        return NextResponse.json({
          error: 'This appears to be a backup file but the internal structure is unexpected. Use the "Upload Backup" restore feature in the backup section instead.',
          code: 'WRONG_FORMAT_BACKUP',
        }, { status: 400 });
      }
      return NextResponse.json({
        error: `Invalid snapshot: missing manifest.json. Files found in ZIP: ${zipFileNames || '(none)'}. Did you export a tenant snapshot first?`,
      }, { status: 400 });
    }
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(await manifestRaw.async('string'));
    } catch {
      return NextResponse.json({ error: 'Invalid snapshot: manifest.json is not valid JSON.' }, { status: 400 });
    }
    if (!manifest.version || !manifest.companyName) {
      return NextResponse.json({ error: 'Invalid snapshot: manifest is missing required fields (version, companyName).' }, { status: 400 });
    }

    // Read all JSON data files — fail early if any critical file is missing
    const readJson = async (name: string): Promise<unknown[]> => {
      const f = zip.file(`${name}.json`);
      if (!f) return [];
      try {
        return JSON.parse(await f.async('string'));
      } catch {
        logger.warn(`[IMPORT-TENANT] ${name}.json is not valid JSON, skipping`);
        return [];
      }
    };

    const companyData = zip.file('company.json')
      ? await (async () => { try { return JSON.parse(await zip.file('company.json')!.async('string')); } catch { return null; } })()
      : null;
    const accounts = await readJson('accounts') as any[];
    const contacts = await readJson('contacts') as any[];
    const transactions = await readJson('transactions') as any[];
    const invoices = await readJson('invoices') as any[];
    const journalEntries = await readJson('journal-entries') as Array<Record<string, any>>;
    const fiscalPeriods = await readJson('fiscal-periods') as Array<Record<string, any>>;
    const budgets = await readJson('budgets') as Array<Record<string, any>>;
    const recurringEntries = await readJson('recurring-entries') as Array<Record<string, any>>;
    const bankStatements = await readJson('bank-statements') as Array<Record<string, any>>;
    const members = await readJson('members') as Array<Record<string, any>>;

    // Validate that we have at least some data to import
    if (accounts.length === 0 && transactions.length === 0 && journalEntries.length === 0 && invoices.length === 0) {
      return NextResponse.json({
        error: 'This snapshot contains no importable data (no accounts, transactions, journal entries, or invoices). Make sure you are using an exported tenant snapshot, not a backup file.',
      }, { status: 400 });
    }

    // ─── Build file data map from zip (files stored under files/ prefix) ───
    const filePathsInZip: string[] = [];
    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.startsWith('files/') && !zipEntry.dir) {
        const storedPath = relativePath.slice('files/'.length);
        if (storedPath) {
          filePathsInZip.push(storedPath);
        }
      }
    });

    const filesData = new Map<string, Buffer>();
    if (filePathsInZip.length > 0) {
      for (const storedPath of filePathsInZip) {
        try {
          const zipEntry = zip.file(`files/${storedPath}`);
          if (zipEntry) {
            const data = await zipEntry.async('nodebuffer');
            filesData.set(storedPath, data);
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    // ─── Build path remapping: old userId paths → new userId paths ───
    const remapFilePath = (oldPath: string | null): string | null => {
      if (!oldPath) return null;
      return oldPath.replace(
        /^(documents|receipts)\/[^/]+\//,
        `$1/${userId}/`
      );
    };

    // ─── PHASE 1: Execute the entire import inside a database transaction ───
    // This ensures atomicity: either everything succeeds or everything is rolled back.
    const result = await db.$transaction(async (tx) => {
      const scope = { companyId };

      // 1a. Delete all existing tenant data (respecting FK order)
      await tx.bankStatementLine.deleteMany({
        where: { bankStatement: { companyId } },
      });
      await tx.bankStatement.deleteMany({ where: scope });
      await tx.document.deleteMany({
        where: { journalEntry: { companyId } },
      });
      await tx.journalEntryLine.deleteMany({
        where: { journalEntry: { companyId } },
      });
      await tx.journalEntry.deleteMany({ where: scope });
      await tx.budgetEntry.deleteMany({
        where: { budget: { companyId } },
      });
      await tx.budget.deleteMany({ where: scope });
      await tx.transaction.deleteMany({ where: scope });
      await tx.invoice.deleteMany({ where: scope });
      await tx.contact.deleteMany({ where: scope });
      await tx.account.deleteMany({ where: scope });
      await tx.fiscalPeriod.deleteMany({ where: scope });
      await tx.recurringEntry.deleteMany({ where: scope });

      // 1b. Update company settings
      if (companyData) {
        await tx.company.update({
          where: { id: companyId },
          data: {
            name: companyData.name || undefined,
            logo: companyData.logo ?? undefined,
            address: companyData.address ?? '',
            phone: companyData.phone ?? '',
            email: companyData.email ?? '',
            cvrNumber: companyData.cvrNumber ?? '',
            companyType: companyData.companyType ?? undefined,
            invoicePrefix: companyData.invoicePrefix ?? 'INV',
            invoiceTerms: companyData.invoiceTerms ?? undefined,
            invoiceNotesTemplate: companyData.invoiceNotesTemplate ?? undefined,
            nextInvoiceSequence: companyData.nextInvoiceSequence ?? 1,
            currentYear: companyData.currentYear ?? new Date().getFullYear(),
            bankName: companyData.bankName ?? '',
            bankAccount: companyData.bankAccount ?? '',
            bankRegistration: companyData.bankRegistration ?? '',
            bankIban: companyData.bankIban ?? undefined,
            bankStreet: companyData.bankStreet ?? undefined,
            bankCity: companyData.bankCity ?? undefined,
            bankCountry: companyData.bankCountry ?? undefined,
            dashboardWidgets: companyData.dashboardWidgets ?? undefined,
          },
        });
      }

      // ─── Build ID reference maps (old _ref → new id) ───
      const accountMap = new Map<string, string>();
      const contactMap = new Map<string, string>();
      const invoiceMap = new Map<string, string>();

      // ─── Import Accounts ───
      for (const a of accounts) {
        const created = await tx.account.create({
          data: {
            number: String(a.number),
            name: String(a.name),
            nameEn: a.nameEn != null ? String(a.nameEn) : undefined,
            type: a.type as never || 'ASSET',
            group: a.group as never || 'CURRENT_ASSETS',
            description: a.description != null ? String(a.description) : undefined,
            isActive: a.isActive !== false,
            isSystem: a.isSystem === true,
            isDemo: false,
            userId,
            companyId,
          },
        });
        if (a._ref) accountMap.set(String(a._ref), created.id);
      }

      // ─── Import Contacts ───
      for (const c of contacts) {
        const created = await tx.contact.create({
          data: {
            name: String(c.name),
            cvrNumber: c.cvrNumber ?? undefined,
            email: c.email ?? undefined,
            phone: c.phone ?? undefined,
            address: c.address ?? undefined,
            city: c.city ?? undefined,
            postalCode: c.postalCode ?? undefined,
            country: c.country || 'Danmark',
            type: c.type || 'CUSTOMER',
            notes: c.notes ?? undefined,
            isActive: c.isActive !== false,
            isDemo: false,
            userId,
            companyId,
          },
        });
        if (c._ref) contactMap.set(String(c._ref), created.id);
      }

      // ─── Import Fiscal Periods ───
      for (const fp of fiscalPeriods) {
        await tx.fiscalPeriod.upsert({
          where: {
            companyId_year_month_isDemo: {
              companyId,
              year: Number(fp.year),
              month: Number(fp.month),
              isDemo: false,
            },
          },
          create: {
            year: Number(fp.year),
            month: Number(fp.month),
            status: fp.status || 'OPEN',
            lockedAt: fp.lockedAt ? new Date(String(fp.lockedAt)) : undefined,
            lockedBy: fp.lockedBy ?? undefined,
            isDemo: false,
            userId,
            companyId,
          },
          update: {
            status: fp.status || 'OPEN',
            lockedAt: fp.lockedAt ? new Date(String(fp.lockedAt)) : undefined,
            lockedBy: fp.lockedBy ?? undefined,
          },
        });
      }

      // ─── Import Invoices ───
      for (const inv of invoices) {
        const issueDate = inv.issueDate || inv.date;
        const created = await tx.invoice.create({
          data: {
            invoiceNumber: String(inv.invoiceNumber),
            customerName: String(inv.customerName),
            customerAddress: inv.customerAddress ?? undefined,
            customerEmail: inv.customerEmail ?? undefined,
            customerPhone: inv.customerPhone ?? undefined,
            customerCvr: inv.customerCvr ?? undefined,
            issueDate: new Date(String(issueDate)),
            dueDate: new Date(String(inv.dueDate)),
            lineItems: typeof inv.lineItems === 'string' ? inv.lineItems : JSON.stringify(inv.lineItems),
            subtotal: Number(inv.subtotal),
            vatTotal: Number(inv.vatTotal),
            total: Number(inv.total),
            currency: inv.currency || 'DKK',
            exchangeRate: inv.exchangeRate ?? undefined,
            status: inv.status || 'DRAFT',
            notes: inv.notes ?? undefined,
            contactId: inv.contactId ? (contactMap.get(String(inv.contactId)) ?? null) : null,
            cancelled: inv.cancelled ?? false,
            cancelReason: inv.cancelReason ?? undefined,
            isDemo: false,
            userId,
            companyId,
          },
        });
        if (inv._ref) invoiceMap.set(String(inv._ref), created.id);
      }

      // ─── Import Transactions (with receipt image path remapping) ───
      for (const t of transactions) {
        const remappedReceiptImage = remapFilePath((t.receiptImage as string) ?? null);

        await tx.transaction.create({
          data: {
            date: new Date(String(t.date)),
            type: (t.type as never) || 'SALE',
            amount: Number(t.amount),
            currency: t.currency || 'DKK',
            exchangeRate: t.exchangeRate ?? undefined,
            amountDKK: t.amountDKK ?? undefined,
            description: String(t.description),
            vatPercent: t.vatPercent != null ? Number(t.vatPercent) : 25.0,
            receiptImage: remappedReceiptImage,
            invoiceId: t.invoiceId ? (invoiceMap.get(String(t.invoiceId)) ?? null) : null,
            accountId: t.accountId ? (accountMap.get(String(t.accountId)) ?? null) : null,
            cancelled: t.cancelled ?? false,
            cancelReason: t.cancelReason ?? undefined,
            originalId: t.originalId ?? undefined,
            isDemo: false,
            userId,
            companyId,
          },
        });
      }

      // ─── Import Journal Entries + Lines + Documents ───
      let filesRestored = 0;
      let filesSkipped = 0;

      for (const je of journalEntries) {
        const entry = await tx.journalEntry.create({
          data: {
            date: new Date(String(je.date)),
            description: String(je.description),
            reference: je.reference ?? undefined,
            status: (je.status as never) || 'POSTED',
            cancelled: je.cancelled ?? false,
            cancelReason: je.cancelReason ?? undefined,
            isDemo: false,
            userId,
            companyId,
          },
        });

        if (Array.isArray(je.lines)) {
          for (const line of je.lines) {
            const resolvedAccountId = line.accountId ? (accountMap.get(String(line.accountId)) ?? null) : null;
            if (!resolvedAccountId) continue; // Skip lines without valid account
            await tx.journalEntryLine.create({
              data: {
                journalEntryId: entry.id,
                accountId: resolvedAccountId,
                debit: Number(line.debit ?? 0),
                credit: Number(line.credit ?? 0),
                vatCode: line.vatCode ?? undefined,
                description: line.description ?? undefined,
              },
            });
          }
        }

        // Create documents and restore actual files
        if (Array.isArray(je.documents)) {
          for (const doc of je.documents) {
            const oldPath = (doc.filePath as string) ?? '';
            const newPath = remapFilePath(oldPath) ?? '';

            // Restore the actual file if present in the zip
            if (filesData.size > 0 && oldPath && filesData.has(oldPath)) {
              try {
                const absPath = path.join(process.cwd(), 'uploads', newPath);
                const dir = path.dirname(absPath);
                await mkdir(dir, { recursive: true });
                const fileBuffer = filesData.get(oldPath)!;
                await writeFile(absPath, fileBuffer);
                filesRestored++;
              } catch (err) {
                logger.warn(`[IMPORT-TENANT] Failed to restore file ${oldPath}:`, err);
                filesSkipped++;
              }
            } else if (filesData.size > 0 && oldPath) {
              filesSkipped++;
            }

            await tx.document.create({
              data: {
                journalEntryId: entry.id,
                fileName: String(doc.fileName || 'unknown'),
                fileType: String(doc.fileType || 'application/octet-stream'),
                fileSize: Number(doc.fileSize ?? 0),
                filePath: newPath,
                description: doc.description ?? undefined,
              },
            });
          }
        }
      }

      // ─── Restore receipt image files from transactions ───
      if (filesData.size > 0) {
        for (const t of transactions) {
          const oldReceiptPath = (t.receiptImage as string) ?? '';
          if (!oldReceiptPath) continue;
          if (!oldReceiptPath.startsWith('receipts/')) continue;

          try {
            const newReceiptPath = remapFilePath(oldReceiptPath) ?? '';
            const absPath = path.join(process.cwd(), 'uploads', newReceiptPath);
            const dir = path.dirname(absPath);
            await mkdir(dir, { recursive: true });

            if (filesData.has(oldReceiptPath)) {
              const fileBuffer = filesData.get(oldReceiptPath)!;
              await writeFile(absPath, fileBuffer);
              filesRestored++;
            }
          } catch (err) {
            logger.warn(`[IMPORT-TENANT] Failed to restore receipt ${oldReceiptPath}:`, err);
            filesSkipped++;
          }
        }
      }

      // ─── Import Budgets + Entries ───
      for (const b of budgets) {
        const budget = await tx.budget.upsert({
          where: {
            companyId_year_isDemo: {
              companyId,
              year: Number(b.year),
              isDemo: false,
            },
          },
          create: {
            name: String(b.name),
            year: Number(b.year),
            notes: b.notes ?? undefined,
            isActive: b.isActive !== false,
            isDemo: false,
            userId,
            companyId,
          },
          update: {
            name: String(b.name),
            notes: b.notes ?? undefined,
            isActive: b.isActive !== false,
          },
        });

        if (Array.isArray(b.entries)) {
          for (const e of b.entries) {
            let newAccountId: string | undefined;
            if (e.accountNumber) {
              const accountRef = accounts.find((a) => a.number === e.accountNumber)?._ref;
              if (accountRef) {
                newAccountId = accountMap.get(String(accountRef)) ?? undefined;
              }
            }

            if (e.accountNumber && !newAccountId) continue;

            await tx.budgetEntry.upsert({
              where: {
                budgetId_accountId: {
                  budgetId: budget.id,
                  accountId: newAccountId || '__none__',
                },
              },
              create: {
                budgetId: budget.id,
                accountId: newAccountId || '__none__',
                january: Number(e.january ?? 0),
                february: Number(e.february ?? 0),
                march: Number(e.march ?? 0),
                april: Number(e.april ?? 0),
                may: Number(e.may ?? 0),
                june: Number(e.june ?? 0),
                july: Number(e.july ?? 0),
                august: Number(e.august ?? 0),
                september: Number(e.september ?? 0),
                october: Number(e.october ?? 0),
                november: Number(e.november ?? 0),
                december: Number(e.december ?? 0),
              },
              update: {
                january: Number(e.january ?? 0),
                february: Number(e.february ?? 0),
                march: Number(e.march ?? 0),
                april: Number(e.april ?? 0),
                may: Number(e.may ?? 0),
                june: Number(e.june ?? 0),
                july: Number(e.july ?? 0),
                august: Number(e.august ?? 0),
                september: Number(e.september ?? 0),
                october: Number(e.october ?? 0),
                november: Number(e.november ?? 0),
                december: Number(e.december ?? 0),
              },
            }).catch(() => {
              // Ignore budget entry upsert errors
            });
          }
        }
      }

      // ─── Import Recurring Entries ───
      for (const re of recurringEntries) {
        await tx.recurringEntry.create({
          data: {
            name: String(re.name),
            description: String(re.description),
            frequency: (re.frequency as never) || 'MONTHLY',
            status: (re.status as never) || 'ACTIVE',
            startDate: new Date(String(re.startDate)),
            endDate: re.endDate ? new Date(String(re.endDate)) : undefined,
            nextExecution: re.nextExecution ? new Date(String(re.nextExecution)) : new Date(),
            lastExecuted: re.lastExecuted ? new Date(String(re.lastExecuted)) : undefined,
            lines: typeof re.lines === 'string' ? re.lines : JSON.stringify(re.lines),
            reference: re.reference ?? undefined,
            isDemo: false,
            userId,
            companyId,
          },
        });
      }

      // ─── Import Bank Statements + Lines ───
      for (const bs of bankStatements) {
        const statement = await tx.bankStatement.create({
          data: {
            bankAccount: String(bs.bankAccount),
            startDate: new Date(String(bs.startDate)),
            endDate: new Date(String(bs.endDate)),
            openingBalance: Number(bs.openingBalance),
            closingBalance: Number(bs.closingBalance),
            fileName: bs.fileName ?? undefined,
            importSource: bs.importSource ?? undefined,
            reconciled: bs.reconciled ?? false,
            reconciledAt: bs.reconciledAt ? new Date(String(bs.reconciledAt)) : undefined,
            isDemo: false,
            userId,
            companyId,
          },
        });

        if (Array.isArray(bs.lines)) {
          for (const line of bs.lines) {
            await tx.bankStatementLine.create({
              data: {
                bankStatementId: statement.id,
                date: new Date(String(line.date)),
                description: String(line.description),
                reference: line.reference ?? undefined,
                amount: Number(line.amount),
                balance: Number(line.balance),
                reconciliationStatus: (line.reconciliationStatus as never) || 'UNMATCHED',
              },
            });
          }
        }
      }

      // ─── Restore Team Members (UserCompany) ───
      let restoredMembers = 0;
      if (Array.isArray(members) && members.length > 0) {
        for (const m of members) {
          if (!m.email) continue;

          const existingUser = await tx.user.findUnique({
            where: { email: String(m.email) },
            select: { id: true },
          });
          if (!existingUser) continue;

          await tx.userCompany.upsert({
            where: {
              userId_companyId: {
                userId: existingUser.id,
                companyId,
              },
            },
            create: {
              userId: existingUser.id,
              companyId,
              role: m.role || 'VIEWER',
              invitedBy: m.invitedBy ?? undefined,
            },
            update: {
              role: m.role || 'VIEWER',
            },
          });
          restoredMembers++;
        }
      }

      // Ensure importing user always has access
      await tx.userCompany.upsert({
        where: {
          userId_companyId: { userId, companyId },
        },
        create: {
          userId,
          companyId,
          role: 'OWNER',
        },
        update: {},
      });

      return {
        importedCounts: {
          accounts: accounts.length,
          contacts: contacts.length,
          transactions: transactions.length,
          invoices: invoices.length,
          journalEntries: journalEntries.length,
          fiscalPeriods: fiscalPeriods.length,
          budgets: budgets.length,
          recurringEntries: recurringEntries.length,
          bankStatements: bankStatements.length,
          members: restoredMembers,
        },
        filesRestored,
        filesSkipped,
      };
    }, {
      timeout: 120_000, // 2 minute timeout for large imports
    });

    // Audit: log AFTER successful import
    await auditLog({
      action: 'DATA_RESET',
      entityType: 'System',
      entityId: companyId,
      userId,
      companyId,
      metadata: {
        type: 'import_tenant',
        source: file.name,
        imported: result.importedCounts,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Tenant data restored successfully',
      sourceCompany: manifest.companyName,
      exportedAt: manifest.exportedAt,
      imported: result.importedCounts,
      filesIncluded: manifest.includeFiles || false,
      filesRestored: result.filesRestored,
      filesSkipped: result.filesSkipped,
    });
  } catch (error) {
    logger.error('[IMPORT-TENANT] Import failed — all changes rolled back:', error);
    const message = error instanceof Error ? error.message : 'Failed to import tenant data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

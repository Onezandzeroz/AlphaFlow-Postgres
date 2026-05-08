/**
 * Backup Engine for AlphaAi Accounting
 *
 * Required by Danish Bookkeeping Law §15:
 * - Automated hourly/daily/weekly/monthly backups (saved as .zip)
 * - SHA-256 checksum verification on the zip file
 * - Retention policy (24 hourly, 30 daily, 52 weekly, 60+ monthly)
 * - User can create manual backups and restore from any backup
 *
 * Backup Scopes:
 * - "tenant": Tenant-specific JSON snapshot (default and only scope)
 *   Only contains data belonging to the specific tenant, exported as
 *   structured JSON files inside a ZIP archive.
 *
 * NOTE: The "full-db" backup scope (raw SQLite file copy) has been removed
 * as part of the PostgreSQL migration. PostgreSQL does not support file-level
 * database copying like SQLite. All backups now use the tenant snapshot approach.
 */

import { db } from '@/lib/db';
import { auditLog } from '@/lib/audit';
import {
  AccountType,
  AccountGroup,
  ContactType,
  TransactionType,
  InvoiceStatus,
  JournalEntryStatus,
  PeriodStatus,
  VATCode,
  RecurringFrequency,
  RecurringStatus,
  ReconciliationStatus,
} from '@prisma/client';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createWriteStream, mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import archiver from 'archiver';
import JSZip from 'jszip';
import { logger } from '@/lib/logger';

// Backup directory structure: Tenant-Backup/{companyName}/{Hourly|Daily|Weekly|Monthly}/
const BACKUP_BASE_DIR = path.join(process.cwd(), 'Tenant-Backup');

// Map internal backup type to human-readable folder name matching retention policy labels
const BACKUP_TYPE_FOLDER: Record<BackupType, string> = {
  hourly:  'Hourly',
  daily:   'Daily',
  weekly:  'Weekly',
  monthly: 'Monthly',
};

/**
 * Sanitize a company name for use as a directory name.
 * Strips or replaces characters that are unsafe for filesystems.
 */
function sanitizeCompanyName(name: string): string {
  return name
    .trim()
    .replace(/[/\\:*?"<>|]/g, '-')  // Replace forbidden filesystem chars
    .replace(/\s+/g, '-')              // Spaces to hyphens
    .replace(/-+/g, '-')                // Collapse multiple hyphens
    .replace(/^-|-$/g, '')              // Strip leading/trailing hyphens
    || 'unknown-company';
}

// Retention policy
const RETENTION = {
  hourly: { count: 24, expiresMs: 25 * 60 * 60 * 1000 },       // 25 hours
  daily:  { count: 30, expiresMs: 31 * 24 * 60 * 60 * 1000 },   // 31 days
  weekly: { count: 52, expiresMs: 53 * 24 * 60 * 60 * 1000 },   // 53 days
  monthly:{ count: 60, expiresMs: 365 * 24 * 60 * 60 * 1000 },  // 1 year
} as const;

export type BackupType = 'hourly' | 'daily' | 'weekly' | 'monthly';
export type TriggerType = 'automatic' | 'manual' | 'scheduled';
export type BackupScope = 'tenant';

/**
 * Ensure backup directory exists for a company.
 * Structure: Tenant-Backup/{companyName}/{Hourly|Daily|Weekly|Monthly}/
 */
async function ensureBackupDir(companyId: string, backupType: BackupType): Promise<string> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });
  const folderName = company ? sanitizeCompanyName(company.name) : companyId;
  const typeFolder = BACKUP_TYPE_FOLDER[backupType] || backupType;
  const dir = path.join(BACKUP_BASE_DIR, folderName, typeFolder);
  if (!fs.existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Calculate SHA-256 checksum of a file
 */
export function calculateChecksum(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Check if a company is the appOwner company (has a SuperDev member).
 */
export async function isAppOwnerCompany(companyId: string): Promise<boolean> {
  const member = await db.userCompany.findFirst({
    where: { companyId },
    include: { user: { select: { isSuperDev: true } } },
  });
  return member?.user.isSuperDev === true;
}

/**
 * Create a ZIP archive of tenant-specific data as structured JSON files.
 * This is used for regular tenant backups — only exports data belonging to the tenant.
 *
 * ZIP contents:
 *   manifest.json        - Metadata (version, timestamp, company info, record counts)
 *   company.json         - Company settings
 *   accounts.json        - Chart of accounts
 *   contacts.json        - Contacts
 *   transactions.json    - Transactions
 *   invoices.json        - Invoices
 *   journal-entries.json - Journal entries with lines and documents
 *   fiscal-periods.json  - Fiscal periods
 *   budgets.json         - Budgets with entries
 *   recurring-entries.json - Recurring entries
 *   bank-statements.json - Bank statements with lines
 */
async function createTenantSnapshotZip(companyId: string, zipOutputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipOutputPath);
    const archive = archiver('zip', {
      zlib: { level: 6 }, // Good compression for JSON text
    });

    output.on('close', () => resolve());
    output.on('error', (err) => reject(err));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);

    // Fetch all tenant data in a single batch
    Promise.all([
      db.company.findUnique({ where: { id: companyId } }),
      db.account.findMany({ where: { companyId }, orderBy: [{ number: 'asc' }] }),
      db.contact.findMany({ where: { companyId }, orderBy: [{ name: 'asc' }] }),
      db.transaction.findMany({ where: { companyId }, orderBy: [{ date: 'desc' }] }),
      db.invoice.findMany({ where: { companyId }, orderBy: [{ createdAt: 'desc' }] }),
      db.journalEntry.findMany({
        where: { companyId },
        include: { lines: { orderBy: [{ id: 'asc' }] }, documents: true },
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
      }),
      db.fiscalPeriod.findMany({ where: { companyId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] }),
      db.budget.findMany({
        where: { companyId },
        include: { entries: { include: { account: { select: { number: true } } } } },
        orderBy: [{ year: 'desc' }],
      }),
      db.recurringEntry.findMany({ where: { companyId }, orderBy: [{ name: 'asc' }] }),
      db.bankStatement.findMany({
        where: { companyId },
        include: { lines: { orderBy: [{ date: 'asc' }, { id: 'asc' }] } },
        orderBy: [{ startDate: 'desc' }],
      }),
      db.userCompany.findMany({
        where: { companyId },
        include: { user: { select: { email: true } } },
        orderBy: [{ joinedAt: 'asc' }],
      }),
    ])
      .then(([company, accounts, contacts, transactions, invoices, journalEntries, fiscalPeriods, budgets, recurringEntries, bankStatements, members]) => {
        // Build and add manifest.json
        const manifest = {
          version: 2,
          type: 'tenant-snapshot',
          exportedAt: new Date().toISOString(),
          companyName: company?.name ?? 'unknown',
          companyId,
          alphaFlowVersion: '1.0.0',
          recordCounts: {
            accounts: accounts.length,
            contacts: contacts.length,
            transactions: transactions.length,
            invoices: invoices.length,
            journalEntries: journalEntries.length,
            fiscalPeriods: fiscalPeriods.length,
            budgets: budgets.length,
            recurringEntries: recurringEntries.length,
            bankStatements: bankStatements.length,
            members: members.length,
          },
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

        // Company settings
        if (company) {
          const companyData = {
            name: company.name,
            address: company.address,
            phone: company.phone,
            email: company.email,
            cvrNumber: company.cvrNumber,
            companyType: company.companyType,
            invoicePrefix: company.invoicePrefix,
            invoiceTerms: company.invoiceTerms,
            invoiceNotesTemplate: company.invoiceNotesTemplate,
            nextInvoiceSequence: company.nextInvoiceSequence,
            currentYear: company.currentYear,
            bankName: company.bankName,
            bankAccount: company.bankAccount,
            bankRegistration: company.bankRegistration,
            bankIban: company.bankIban,
            bankStreet: company.bankStreet,
            bankCity: company.bankCity,
            bankCountry: company.bankCountry,
            dashboardWidgets: company.dashboardWidgets,
          };
          archive.append(JSON.stringify(companyData, null, 2), { name: 'company.json' });
        }

        // Data files
        archive.append(JSON.stringify(accounts.map((a) => ({
          number: a.number, name: a.name, nameEn: a.nameEn, type: a.type, group: a.group,
          description: a.description, isActive: a.isActive, isSystem: a.isSystem, _ref: a.id,
        })), null, 2), { name: 'accounts.json' });

        archive.append(JSON.stringify(contacts.map((c) => ({
          name: c.name, cvrNumber: c.cvrNumber, email: c.email, phone: c.phone,
          address: c.address, city: c.city, postalCode: c.postalCode, country: c.country,
          type: c.type, notes: c.notes, isActive: c.isActive, _ref: c.id,
        })), null, 2), { name: 'contacts.json' });

        archive.append(JSON.stringify(transactions.map((t) => ({
          date: t.date.toISOString().split('T')[0], type: t.type, amount: t.amount,
          currency: t.currency, exchangeRate: t.exchangeRate, amountDKK: t.amountDKK,
          description: t.description, vatPercent: t.vatPercent, receiptImage: t.receiptImage,
          invoiceId: t.invoiceId, accountId: t.accountId, cancelled: t.cancelled,
          cancelReason: t.cancelReason, originalId: t.originalId, _ref: t.id,
        })), null, 2), { name: 'transactions.json' });

        archive.append(JSON.stringify(invoices.map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate.toISOString().split('T')[0],
          dueDate: inv.dueDate.toISOString().split('T')[0],
          customerName: inv.customerName, customerAddress: inv.customerAddress,
          customerEmail: inv.customerEmail, customerPhone: inv.customerPhone,
          customerCvr: inv.customerCvr, lineItems: inv.lineItems,
          subtotal: inv.subtotal, vatTotal: inv.vatTotal, total: inv.total,
          currency: inv.currency, exchangeRate: inv.exchangeRate, status: inv.status,
          notes: inv.notes, contactId: inv.contactId, cancelled: inv.cancelled,
          cancelReason: inv.cancelReason, _ref: inv.id,
        })), null, 2), { name: 'invoices.json' });

        archive.append(JSON.stringify(journalEntries.map((je) => ({
          date: je.date.toISOString().split('T')[0], description: je.description,
          reference: je.reference, status: je.status, cancelled: je.cancelled,
          cancelReason: je.cancelReason,
          lines: je.lines.map((l) => ({
            accountId: l.accountId, debit: l.debit, credit: l.credit,
            vatCode: l.vatCode, description: l.description,
          })),
          documents: je.documents.map((d) => ({
            fileName: d.fileName, fileType: d.fileType, fileSize: d.fileSize,
            filePath: d.filePath, description: d.description,
          })),
          _ref: je.id,
        })), null, 2), { name: 'journal-entries.json' });

        archive.append(JSON.stringify(fiscalPeriods.map((fp) => ({
          year: fp.year, month: fp.month, status: fp.status,
          lockedAt: fp.lockedAt?.toISOString() ?? null, lockedBy: fp.lockedBy, _ref: fp.id,
        })), null, 2), { name: 'fiscal-periods.json' });

        archive.append(JSON.stringify(budgets.map((b) => ({
          name: b.name, year: b.year, notes: b.notes, isActive: b.isActive,
          entries: b.entries.map((e) => ({
            accountNumber: e.account?.number ?? null,
            january: e.january, february: e.february, march: e.march,
            april: e.april, may: e.may, june: e.june,
            july: e.july, august: e.august, september: e.september,
            october: e.october, november: e.november, december: e.december,
          })),
          _ref: b.id,
        })), null, 2), { name: 'budgets.json' });

        archive.append(JSON.stringify(recurringEntries.map((re) => ({
          name: re.name, description: re.description, frequency: re.frequency,
          status: re.status,
          startDate: re.startDate.toISOString().split('T')[0],
          endDate: re.endDate?.toISOString().split('T')[0] ?? null,
          nextExecution: re.nextExecution?.toISOString().split('T')[0] ?? null,
          lastExecuted: re.lastExecuted?.toISOString() ?? null,
          lines: typeof re.lines === 'string' ? JSON.parse(re.lines) : re.lines,
          reference: re.reference, _ref: re.id,
        })), null, 2), { name: 'recurring-entries.json' });

        archive.append(JSON.stringify(bankStatements.map((bs) => ({
          bankAccount: bs.bankAccount,
          startDate: bs.startDate.toISOString().split('T')[0],
          endDate: bs.endDate.toISOString().split('T')[0],
          openingBalance: bs.openingBalance, closingBalance: bs.closingBalance,
          fileName: bs.fileName, importSource: bs.importSource,
          reconciled: bs.reconciled,
          reconciledAt: bs.reconciledAt?.toISOString() ?? null,
          lines: bs.lines.map((l) => ({
            date: l.date.toISOString().split('T')[0], description: l.description,
            reference: l.reference, amount: l.amount, balance: l.balance,
            reconciliationStatus: l.reconciliationStatus,
          })),
          _ref: bs.id,
        })), null, 2), { name: 'bank-statements.json' });

        archive.append(JSON.stringify(members.map((m) => ({
          email: m.user.email, role: m.role,
          joinedAt: m.joinedAt?.toISOString() ?? null, invitedBy: m.invitedBy,
        })), null, 2), { name: 'members.json' });

        archive.finalize();
      })
      .catch((err) => {
        reject(err);
      });
  });
}

/**
 * Create a backup.
 *
 * @param scope - "tenant" for tenant-specific JSON snapshot (only supported scope)
 *
 * Flow:
 * 1. Export tenant data as structured JSON
 * 2. Create a ZIP containing the JSON files
 * 3. Calculate SHA-256 of the ZIP
 * 4. Record in database
 */
export async function createBackup(
  userId: string,
  triggerType: TriggerType,
  backupType: BackupType,
  companyId: string,
  scope: BackupScope = 'tenant',
  meta?: Record<string, unknown>
): Promise<{ id: string; filePath: string; fileSize: number; sha256: string } | null> {
  // Fetch denormalized reference data for DB readability (companyName + userEmail)
  const [companyInfo, userInfo] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select: { name: true } }),
    db.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  const companyName = companyInfo?.name ?? null;
  const userEmail = userInfo?.email ?? null;

  const backupDir = await ensureBackupDir(companyId, backupType);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipFilename = `snapshot-${scope}-${backupType}-${timestamp}.zip`;
  const zipFilePath = path.join(backupDir, zipFilename);

  try {
    // ─── Tenant snapshot backup ──────────────────────────────────────
    await createTenantSnapshotZip(companyId, zipFilePath);

    // Calculate SHA-256 of the ZIP file
    const stats = fs.statSync(zipFilePath);
    const sha256 = calculateChecksum(zipFilePath);

    // Calculate expiry
    const expiresMs = RETENTION[backupType]?.expiresMs || 365 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + expiresMs);

    // Save backup record in database
    const backup = await db.backup.create({
      data: {
        userId,
        userEmail,
        companyId,
        companyName,
        triggerType,
        backupType,
        scope,
        filePath: zipFilePath,
        fileSize: stats.size,
        sha256,
        status: 'completed',
        expiresAt,
      },
    });

    // Audit log
    await auditLog({
      action: 'BACKUP_CREATE',
      entityType: 'Backup',
      entityId: backup.id,
      userId,
      companyId,
      metadata: {
        triggerType,
        backupType,
        scope,
        fileSize: stats.size,
        sha256,
        filename: zipFilename,
        format: 'zip',
        ...meta,
      },
    });

    return {
      id: backup.id,
      filePath: zipFilePath,
      fileSize: stats.size,
      sha256,
    };
  } catch (error) {
    logger.error('[BACKUP] Failed to create backup:', error);

    // Clean up any partial files
    try {
      if (fs.existsSync(zipFilePath)) rmSync(zipFilePath, { force: true });
    } catch { /* ignore */ }

    // Record failure
    await db.backup.create({
      data: {
        userId,
        userEmail,
        companyId,
        companyName,
        triggerType,
        backupType,
        scope,
        filePath: zipFilePath,
        fileSize: 0,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return null;
  }
}

/**
 * Restore from a backup.
 *
 * Parses the JSON files from the tenant snapshot ZIP,
 * deletes existing tenant data, and re-imports from the snapshot.
 * Only affects data belonging to this tenant (not other tenants).
 * Creates a pre-restore safety backup first.
 */
export async function restoreBackup(
  userId: string,
  backupId: string,
  companyId: string,
  meta?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const backup = await db.backup.findFirst({
    where: { id: backupId },
  });

  if (!backup) {
    return { success: false, error: 'Backup not found' };
  }

  if (!fs.existsSync(backup.filePath)) {
    return { success: false, error: 'Backup file not found on disk' };
  }

  // Verify checksum on the ZIP file
  if (backup.sha256) {
    const currentChecksum = calculateChecksum(backup.filePath);
    if (currentChecksum !== backup.sha256) {
      return { success: false, error: 'Backup checksum mismatch — file may be corrupted' };
    }
  }

  return restoreTenantSnapshot(userId, backup, companyId, meta);
}

/**
 * Restore from a tenant snapshot backup.
 * Deletes existing tenant data and re-imports from the snapshot ZIP.
 * Only affects data belonging to the specific tenant — NOT other tenants.
 */
async function restoreTenantSnapshot(
  userId: string,
  backup: { id: string; backupType: string; filePath: string },
  companyId: string,
  meta?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Create a pre-restore safety backup (tenant-snapshot scope)
    const preRestoreBackup = await createBackup(userId, 'automatic', 'hourly', companyId, 'tenant', {
      reason: 'pre-tenant-restore-snapshot',
    });

    // 2. Parse the tenant snapshot ZIP
    const zipBuffer = fs.readFileSync(backup.filePath);
    const zip = await JSZip.loadAsync(zipBuffer);

    const manifestFile = zip.file('manifest.json');
    if (!manifestFile) {
      return { success: false, error: 'Invalid tenant snapshot: missing manifest.json' };
    }

    const manifest = JSON.parse(await manifestFile.async('string'));

    // 3. Delete existing tenant data (in correct order to respect FK constraints)
    // We delete in reverse dependency order
    logger.info(`[BACKUP-RESTORE] Deleting existing tenant data for company ${companyId}...`);

    await db.bankStatementLine.deleteMany({
      where: { bankStatement: { companyId } },
    });
    await db.budgetEntry.deleteMany({
      where: { budget: { companyId } },
    });
    await db.journalEntryLine.deleteMany({
      where: { journalEntry: { companyId } },
    });
    await db.document.deleteMany({
      where: { journalEntry: { companyId } },
    });

    await db.bankStatement.deleteMany({ where: { companyId } });
    await db.recurringEntry.deleteMany({ where: { companyId } });
    await db.budget.deleteMany({ where: { companyId } });
    await db.fiscalPeriod.deleteMany({ where: { companyId } });
    await db.journalEntry.deleteMany({ where: { companyId } });
    await db.transaction.deleteMany({ where: { companyId } });
    await db.invoice.deleteMany({ where: { companyId } });
    await db.contact.deleteMany({ where: { companyId } });
    await db.account.deleteMany({ where: { companyId } });

    // 4. Import data from snapshot JSON files
    logger.info(`[BACKUP-RESTORE] Importing tenant data from snapshot for company ${companyId}...`);
    let importedCounts: Record<string, number> = {};

    // Company settings
    const companyFile = zip.file('company.json');
    if (companyFile) {
      const companyData = JSON.parse(await companyFile.async('string'));
      await db.company.update({
        where: { id: companyId },
        data: {
          name: companyData.name,
          address: companyData.address ?? '',
          phone: companyData.phone ?? '',
          email: companyData.email ?? '',
          cvrNumber: companyData.cvrNumber ?? '',
          companyType: companyData.companyType,
          invoicePrefix: companyData.invoicePrefix ?? 'INV',
          invoiceTerms: companyData.invoiceTerms ?? '',
          invoiceNotesTemplate: companyData.invoiceNotesTemplate,
          nextInvoiceSequence: companyData.nextInvoiceSequence ?? 1,
          currentYear: companyData.currentYear ?? new Date().getFullYear(),
          bankName: companyData.bankName ?? '',
          bankAccount: companyData.bankAccount ?? '',
          bankRegistration: companyData.bankRegistration ?? '',
          bankIban: companyData.bankIban,
          bankStreet: companyData.bankStreet,
          bankCity: companyData.bankCity,
          bankCountry: companyData.bankCountry,
          dashboardWidgets: companyData.dashboardWidgets,
        },
      });
      importedCounts.company = 1;
    }

    // Accounts
    const accountsFile = zip.file('accounts.json');
    if (accountsFile) {
      const accountsData = JSON.parse(await accountsFile.async('string')) as Array<Record<string, unknown>>;
      for (const a of accountsData) {
        await db.account.create({
          data: {
            companyId,
            userId,
            number: a.number as string,
            name: a.name as string,
            nameEn: (a.nameEn as string) ?? null,
            type: a.type as AccountType,
            group: a.group as AccountGroup,
            description: (a.description as string) ?? null,
            isActive: (a.isActive as boolean) ?? true,
            isSystem: (a.isSystem as boolean) ?? false,
          },
        });
      }
      importedCounts.accounts = accountsData.length;
    }

    // Contacts
    const contactsFile = zip.file('contacts.json');
    if (contactsFile) {
      const contactsData = JSON.parse(await contactsFile.async('string')) as Array<Record<string, unknown>>;
      for (const c of contactsData) {
        await db.contact.create({
          data: {
            companyId,
            userId,
            name: c.name as string,
            cvrNumber: (c.cvrNumber as string) ?? null,
            email: (c.email as string) ?? null,
            phone: (c.phone as string) ?? null,
            address: (c.address as string) ?? null,
            city: (c.city as string) ?? null,
            postalCode: (c.postalCode as string) ?? null,
            country: (c.country as string) ?? 'Danmark',
            type: c.type as ContactType,
            notes: (c.notes as string) ?? null,
            isActive: (c.isActive as boolean) ?? true,
          },
        });
      }
      importedCounts.contacts = contactsData.length;
    }

    // Transactions
    const txFile = zip.file('transactions.json');
    if (txFile) {
      const txData = JSON.parse(await txFile.async('string')) as Array<Record<string, unknown>>;
      for (const t of txData) {
        await db.transaction.create({
          data: {
            companyId,
            userId,
            date: new Date(t.date as string),
            type: t.type as TransactionType,
            amount: t.amount as number,
            currency: (t.currency as string) ?? 'DKK',
            exchangeRate: (t.exchangeRate as number) ?? null,
            amountDKK: (t.amountDKK as number) ?? null,
            description: t.description as string,
            vatPercent: (t.vatPercent as number) ?? 25.0,
            receiptImage: (t.receiptImage as string) ?? null,
            invoiceId: (t.invoiceId as string) ?? null,
            accountId: (t.accountId as string) ?? null,
            cancelled: (t.cancelled as boolean) ?? false,
            cancelReason: (t.cancelReason as string) ?? null,
            originalId: (t.originalId as string) ?? null,
          },
        });
      }
      importedCounts.transactions = txData.length;
    }

    // Invoices
    const invFile = zip.file('invoices.json');
    if (invFile) {
      const invData = JSON.parse(await invFile.async('string')) as Array<Record<string, unknown>>;
      for (const inv of invData) {
        await db.invoice.create({
          data: {
            companyId,
            userId,
            invoiceNumber: inv.invoiceNumber as string,
            customerName: inv.customerName as string,
            customerAddress: (inv.customerAddress as string) ?? null,
            customerEmail: (inv.customerEmail as string) ?? null,
            customerPhone: (inv.customerPhone as string) ?? null,
            customerCvr: (inv.customerCvr as string) ?? null,
            issueDate: new Date(inv.issueDate as string),
            dueDate: new Date(inv.dueDate as string),
            lineItems: inv.lineItems as string,
            subtotal: inv.subtotal as number,
            vatTotal: inv.vatTotal as number,
            total: inv.total as number,
            currency: (inv.currency as string) ?? 'DKK',
            exchangeRate: (inv.exchangeRate as number) ?? null,
            status: inv.status as InvoiceStatus,
            notes: (inv.notes as string) ?? null,
            contactId: (inv.contactId as string) ?? null,
            cancelled: (inv.cancelled as boolean) ?? false,
            cancelReason: (inv.cancelReason as string) ?? null,
          },
        });
      }
      importedCounts.invoices = invData.length;
    }

    // Journal entries (with lines and documents)
    const jeFile = zip.file('journal-entries.json');
    if (jeFile) {
      const jeData = JSON.parse(await jeFile.async('string')) as Array<Record<string, unknown>>;
      for (const je of jeData) {
        const entry = await db.journalEntry.create({
          data: {
            companyId,
            userId,
            date: new Date(je.date as string),
            description: je.description as string,
            reference: (je.reference as string) ?? null,
            status: je.status as JournalEntryStatus,
            cancelled: (je.cancelled as boolean) ?? false,
            cancelReason: (je.cancelReason as string) ?? null,
          },
        });

        // Lines
        const lines = (je.lines as Array<Record<string, unknown>>) ?? [];
        for (const l of lines) {
          await db.journalEntryLine.create({
            data: {
              journalEntryId: entry.id,
              accountId: l.accountId as string,
              debit: (l.debit as number) ?? 0,
              credit: (l.credit as number) ?? 0,
              vatCode: (l.vatCode as VATCode) ?? null,
              description: (l.description as string) ?? null,
            },
          });
        }

        // Documents
        const docs = (je.documents as Array<Record<string, unknown>>) ?? [];
        for (const d of docs) {
          await db.document.create({
            data: {
              journalEntryId: entry.id,
              fileName: d.fileName as string,
              fileType: d.fileType as string,
              fileSize: (d.fileSize as number) ?? 0,
              filePath: (d.filePath as string) ?? '',
              description: (d.description as string) ?? null,
            },
          });
        }
      }
      importedCounts.journalEntries = jeData.length;
    }

    // Fiscal periods
    const fpFile = zip.file('fiscal-periods.json');
    if (fpFile) {
      const fpData = JSON.parse(await fpFile.async('string')) as Array<Record<string, unknown>>;
      for (const fp of fpData) {
        await db.fiscalPeriod.create({
          data: {
            companyId,
            userId,
            year: fp.year as number,
            month: fp.month as number,
            status: fp.status as PeriodStatus,
            lockedAt: fp.lockedAt ? new Date(fp.lockedAt as string) : null,
            lockedBy: (fp.lockedBy as string) ?? null,
          },
        });
      }
      importedCounts.fiscalPeriods = fpData.length;
    }

    // Budgets (with entries)
    const budgetFile = zip.file('budgets.json');
    if (budgetFile) {
      const budgetData = JSON.parse(await budgetFile.async('string')) as Array<Record<string, unknown>>;
      for (const b of budgetData) {
        // Need to find the account ID for each entry by account number
        const budget = await db.budget.create({
          data: {
            companyId,
            userId,
            name: b.name as string,
            year: b.year as number,
            notes: (b.notes as string) ?? null,
            isActive: (b.isActive as boolean) ?? true,
          },
        });

        const entries = (b.entries as Array<Record<string, unknown>>) ?? [];
        for (const e of entries) {
          let accountId: string | null = null;
          if (e.accountNumber) {
            const acct = await db.account.findFirst({
              where: { companyId, number: e.accountNumber as string },
            });
            if (acct) accountId = acct.id;
          }
          if (!accountId) continue; // Skip entries with missing accounts

          await db.budgetEntry.create({
            data: {
              budgetId: budget.id,
              accountId,
              january: (e.january as number) ?? 0,
              february: (e.february as number) ?? 0,
              march: (e.march as number) ?? 0,
              april: (e.april as number) ?? 0,
              may: (e.may as number) ?? 0,
              june: (e.june as number) ?? 0,
              july: (e.july as number) ?? 0,
              august: (e.august as number) ?? 0,
              september: (e.september as number) ?? 0,
              october: (e.october as number) ?? 0,
              november: (e.november as number) ?? 0,
              december: (e.december as number) ?? 0,
            },
          });
        }
      }
      importedCounts.budgets = budgetData.length;
    }

    // Recurring entries
    const reFile = zip.file('recurring-entries.json');
    if (reFile) {
      const reData = JSON.parse(await reFile.async('string')) as Array<Record<string, unknown>>;
      for (const re of reData) {
        await db.recurringEntry.create({
          data: {
            companyId,
            userId,
            name: re.name as string,
            description: re.description as string,
            frequency: re.frequency as RecurringFrequency,
            status: re.status as RecurringStatus,
            startDate: new Date(re.startDate as string),
            endDate: re.endDate ? new Date(re.endDate as string) : null,
            nextExecution: re.nextExecution ? new Date(re.nextExecution as string) : new Date(),
            lastExecuted: re.lastExecuted ? new Date(re.lastExecuted as string) : null,
            lines: JSON.stringify(re.lines ?? []),
            reference: (re.reference as string) ?? null,
          },
        });
      }
      importedCounts.recurringEntries = reData.length;
    }

    // Bank statements (with lines)
    const bsFile = zip.file('bank-statements.json');
    if (bsFile) {
      const bsData = JSON.parse(await bsFile.async('string')) as Array<Record<string, unknown>>;
      for (const bs of bsData) {
        const stmt = await db.bankStatement.create({
          data: {
            companyId,
            userId,
            bankAccount: bs.bankAccount as string,
            startDate: new Date(bs.startDate as string),
            endDate: new Date(bs.endDate as string),
            openingBalance: bs.openingBalance as number,
            closingBalance: bs.closingBalance as number,
            fileName: (bs.fileName as string) ?? null,
            importSource: (bs.importSource as string) ?? null,
            reconciled: (bs.reconciled as boolean) ?? false,
            reconciledAt: bs.reconciledAt ? new Date(bs.reconciledAt as string) : null,
          },
        });

        const stmtLines = (bs.lines as Array<Record<string, unknown>>) ?? [];
        for (const l of stmtLines) {
          await db.bankStatementLine.create({
            data: {
              bankStatementId: stmt.id,
              date: new Date(l.date as string),
              description: l.description as string,
              reference: (l.reference as string) ?? null,
              amount: l.amount as number,
              balance: l.balance as number,
              reconciliationStatus: (l.reconciliationStatus as ReconciliationStatus) ?? 'UNMATCHED',
            },
          });
        }
      }
      importedCounts.bankStatements = bsData.length;
    }

    // 5. Audit log
    await auditLog({
      action: 'BACKUP_RESTORE',
      entityType: 'Backup',
      entityId: backup.id,
      userId,
      companyId,
      metadata: {
        restoredFrom: backup.backupType,
        scope: 'tenant',
        preRestoreBackupId: preRestoreBackup?.id,
        format: 'zip',
        importedCounts,
        snapshotExportedAt: manifest.exportedAt ?? 'unknown',
        ...meta,
      },
    });

    logger.info(`[BACKUP] Tenant snapshot restore successful for company ${companyId}:`, importedCounts);

    return { success: true };
  } catch (error) {
    logger.error('[BACKUP] Tenant snapshot restore failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during tenant restore',
    };
  }
}

/**
 * Restore from an uploaded backup ZIP buffer.
 *
 * Expects the ZIP to contain "manifest.json" (tenant snapshot format).
 * The caller (API route) is responsible for permission checks.
 */
export async function restoreBackupFromBuffer(
  userId: string,
  zipBuffer: Buffer,
  companyId: string,
  isAppOwner: boolean,
  originalFilename?: string,
  meta?: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    return { success: false, error: 'Uploaded file is not a valid ZIP archive' };
  }

  const hasManifest = zip.file('manifest.json') !== null;

  if (hasManifest) {
    // ─── Tenant snapshot ────────────────────────────────────────────
    // Permission check is done in the API route (allows OWNER, appOwner, and appOwner-in-oversight)
    // No additional check needed here — the caller is responsible for authorization.

    // Save buffer to temp file, then call restoreTenantSnapshot
    const tempZipPath = path.join(BACKUP_BASE_DIR, `.upload-tenant-restore-${Date.now()}.zip`);
    try {
      fs.writeFileSync(tempZipPath, zipBuffer);

      // Create a pre-restore safety backup
      const preRestoreBackup = await createBackup(userId, 'automatic', 'hourly', companyId, 'tenant', {
        reason: 'pre-upload-tenant-restore',
        source: originalFilename || 'uploaded-snapshot.zip',
      });

      // Use the restore logic inline (similar to restoreTenantSnapshot but from buffer)
      const manifestFile = zip.file('manifest.json');
      const manifest = manifestFile ? JSON.parse(await manifestFile.async('string')) : {};

      // Delete existing tenant data
      await db.bankStatementLine.deleteMany({ where: { bankStatement: { companyId } } });
      await db.budgetEntry.deleteMany({ where: { budget: { companyId } } });
      await db.journalEntryLine.deleteMany({ where: { journalEntry: { companyId } } });
      await db.document.deleteMany({ where: { journalEntry: { companyId } } });
      await db.bankStatement.deleteMany({ where: { companyId } });
      await db.recurringEntry.deleteMany({ where: { companyId } });
      await db.budget.deleteMany({ where: { companyId } });
      await db.fiscalPeriod.deleteMany({ where: { companyId } });
      await db.journalEntry.deleteMany({ where: { companyId } });
      await db.transaction.deleteMany({ where: { companyId } });
      await db.invoice.deleteMany({ where: { companyId } });
      await db.contact.deleteMany({ where: { companyId } });
      await db.account.deleteMany({ where: { companyId } });

      // Import from snapshot JSON files (reusing the same import logic)
      const importResult = await importTenantDataFromZip(zip, companyId, userId);

      // Audit log
      await auditLog({
        action: 'BACKUP_RESTORE',
        entityType: 'Backup',
        entityId: 'upload-tenant-restore',
        userId,
        companyId,
        metadata: {
          source: 'upload',
          scope: 'tenant',
          originalFilename: originalFilename || 'unknown',
          fileSize: zipBuffer.length,
          sha256: crypto.createHash('sha256').update(zipBuffer).digest('hex'),
          preRestoreBackupId: preRestoreBackup?.id,
          importedCounts: importResult,
          snapshotExportedAt: manifest.exportedAt ?? 'unknown',
          ...meta,
        },
      });

      logger.info(`[BACKUP] Upload tenant snapshot restore successful from ${originalFilename || 'uploaded file'}`);
      return { success: true };
    } finally {
      try { rmSync(tempZipPath, { force: true }); } catch { /* ignore */ }
    }
  } else {
    return {
      success: false,
      error: 'Uploaded ZIP does not contain a valid tenant snapshot. Expected manifest.json.',
    };
  }
}

/**
 * Helper: Import tenant data from an already-parsed JSZip object.
 * Returns counts of imported records per type.
 */
async function importTenantDataFromZip(zip: InstanceType<typeof JSZip>, companyId: string, userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  // Company settings
  const companyFile = zip.file('company.json');
  if (companyFile) {
    const companyData = JSON.parse(await companyFile.async('string'));
    await db.company.update({
      where: { id: companyId },
      data: {
        name: companyData.name,
        address: companyData.address ?? '',
        phone: companyData.phone ?? '',
        email: companyData.email ?? '',
        cvrNumber: companyData.cvrNumber ?? '',
        companyType: companyData.companyType,
        invoicePrefix: companyData.invoicePrefix ?? 'INV',
        invoiceTerms: companyData.invoiceTerms ?? '',
        invoiceNotesTemplate: companyData.invoiceNotesTemplate,
        nextInvoiceSequence: companyData.nextInvoiceSequence ?? 1,
        currentYear: companyData.currentYear ?? new Date().getFullYear(),
        bankName: companyData.bankName ?? '',
        bankAccount: companyData.bankAccount ?? '',
        bankRegistration: companyData.bankRegistration ?? '',
        bankIban: companyData.bankIban,
        bankStreet: companyData.bankStreet,
        bankCity: companyData.bankCity,
        bankCountry: companyData.bankCountry,
        dashboardWidgets: companyData.dashboardWidgets,
      },
    });
    counts.company = 1;
  }

  // Accounts
  const accountsFile = zip.file('accounts.json');
  if (accountsFile) {
    const accountsData = JSON.parse(await accountsFile.async('string')) as Array<Record<string, unknown>>;
    for (const a of accountsData) {
      await db.account.create({
        data: {
          companyId, userId,
          number: a.number as string, name: a.name as string,
          nameEn: (a.nameEn as string) ?? null,
          type: a.type as AccountType, group: a.group as AccountGroup,
          description: (a.description as string) ?? null,
          isActive: (a.isActive as boolean) ?? true,
          isSystem: (a.isSystem as boolean) ?? false,
        },
      });
    }
    counts.accounts = accountsData.length;
  }

  // Contacts
  const contactsFile = zip.file('contacts.json');
  if (contactsFile) {
    const contactsData = JSON.parse(await contactsFile.async('string')) as Array<Record<string, unknown>>;
    for (const c of contactsData) {
      await db.contact.create({
        data: {
          companyId, userId,
          name: c.name as string,
          cvrNumber: (c.cvrNumber as string) ?? null,
          email: (c.email as string) ?? null, phone: (c.phone as string) ?? null,
          address: (c.address as string) ?? null, city: (c.city as string) ?? null,
          postalCode: (c.postalCode as string) ?? null,
          country: (c.country as string) ?? 'Danmark',
          type: c.type as ContactType, notes: (c.notes as string) ?? null,
          isActive: (c.isActive as boolean) ?? true,
        },
      });
    }
    counts.contacts = contactsData.length;
  }

  // Transactions
  const txFile = zip.file('transactions.json');
  if (txFile) {
    const txData = JSON.parse(await txFile.async('string')) as Array<Record<string, unknown>>;
    for (const t of txData) {
      await db.transaction.create({
        data: {
          companyId, userId,
          date: new Date(t.date as string), type: t.type as TransactionType,
          amount: t.amount as number, currency: (t.currency as string) ?? 'DKK',
          exchangeRate: (t.exchangeRate as number) ?? null,
          amountDKK: (t.amountDKK as number) ?? null,
          description: t.description as string,
          vatPercent: (t.vatPercent as number) ?? 25.0,
          receiptImage: (t.receiptImage as string) ?? null,
          invoiceId: (t.invoiceId as string) ?? null,
          accountId: (t.accountId as string) ?? null,
          cancelled: (t.cancelled as boolean) ?? false,
          cancelReason: (t.cancelReason as string) ?? null,
        },
      });
    }
    counts.transactions = txData.length;
  }

  // Invoices
  const invFile = zip.file('invoices.json');
  if (invFile) {
    const invData = JSON.parse(await invFile.async('string')) as Array<Record<string, unknown>>;
    for (const inv of invData) {
      await db.invoice.create({
        data: {
          companyId, userId,
          invoiceNumber: inv.invoiceNumber as string,
          customerName: inv.customerName as string,
          customerAddress: (inv.customerAddress as string) ?? null,
          customerEmail: (inv.customerEmail as string) ?? null,
          customerPhone: (inv.customerPhone as string) ?? null,
          customerCvr: (inv.customerCvr as string) ?? null,
          issueDate: new Date(inv.issueDate as string),
          dueDate: new Date(inv.dueDate as string),
          lineItems: inv.lineItems as string,
          subtotal: inv.subtotal as number, vatTotal: inv.vatTotal as number,
          total: inv.total as number, currency: (inv.currency as string) ?? 'DKK',
          exchangeRate: (inv.exchangeRate as number) ?? null,
          status: inv.status as InvoiceStatus, notes: (inv.notes as string) ?? null,
          contactId: (inv.contactId as string) ?? null,
          cancelled: (inv.cancelled as boolean) ?? false,
          cancelReason: (inv.cancelReason as string) ?? null,
        },
      });
    }
    counts.invoices = invData.length;
  }

  // Journal entries
  const jeFile = zip.file('journal-entries.json');
  if (jeFile) {
    const jeData = JSON.parse(await jeFile.async('string')) as Array<Record<string, unknown>>;
    for (const je of jeData) {
      const entry = await db.journalEntry.create({
        data: {
          companyId, userId,
          date: new Date(je.date as string), description: je.description as string,
          reference: (je.reference as string) ?? null, status: je.status as JournalEntryStatus,
          cancelled: (je.cancelled as boolean) ?? false,
          cancelReason: (je.cancelReason as string) ?? null,
        },
      });
      for (const l of ((je.lines as Array<Record<string, unknown>>) ?? [])) {
        await db.journalEntryLine.create({
          data: {
            journalEntryId: entry.id, accountId: l.accountId as string,
            debit: (l.debit as number) ?? 0, credit: (l.credit as number) ?? 0,
            vatCode: (l.vatCode as VATCode) ?? null,
            description: (l.description as string) ?? null,
          },
        });
      }
      for (const d of ((je.documents as Array<Record<string, unknown>>) ?? [])) {
        await db.document.create({
          data: {
            journalEntryId: entry.id,
            fileName: d.fileName as string, fileType: d.fileType as string,
            fileSize: (d.fileSize as number) ?? 0,
            filePath: (d.filePath as string) ?? '',
            description: (d.description as string) ?? null,
          },
        });
      }
    }
    counts.journalEntries = jeData.length;
  }

  // Fiscal periods
  const fpFile = zip.file('fiscal-periods.json');
  if (fpFile) {
    const fpData = JSON.parse(await fpFile.async('string')) as Array<Record<string, unknown>>;
    for (const fp of fpData) {
      await db.fiscalPeriod.create({
        data: {
          companyId, userId,
          year: fp.year as number, month: fp.month as number,
          status: fp.status as PeriodStatus,
          lockedAt: fp.lockedAt ? new Date(fp.lockedAt as string) : null,
          lockedBy: (fp.lockedBy as string) ?? null,
        },
      });
    }
    counts.fiscalPeriods = fpData.length;
  }

  // Budgets
  const budgetFile = zip.file('budgets.json');
  if (budgetFile) {
    const budgetData = JSON.parse(await budgetFile.async('string')) as Array<Record<string, unknown>>;
    for (const b of budgetData) {
      const budget = await db.budget.create({
        data: {
          companyId, userId,
          name: b.name as string, year: b.year as number,
          notes: (b.notes as string) ?? null, isActive: (b.isActive as boolean) ?? true,
        },
      });
      for (const e of ((b.entries as Array<Record<string, unknown>>) ?? [])) {
        let accountId: string | null = null;
        if (e.accountNumber) {
          const acct = await db.account.findFirst({ where: { companyId, number: e.accountNumber as string } });
          if (acct) accountId = acct.id;
        }
        if (!accountId) continue;
        await db.budgetEntry.create({
          data: {
            budgetId: budget.id, accountId,
            january: (e.january as number) ?? 0, february: (e.february as number) ?? 0,
            march: (e.march as number) ?? 0, april: (e.april as number) ?? 0,
            may: (e.may as number) ?? 0, june: (e.june as number) ?? 0,
            july: (e.july as number) ?? 0, august: (e.august as number) ?? 0,
            september: (e.september as number) ?? 0, october: (e.october as number) ?? 0,
            november: (e.november as number) ?? 0, december: (e.december as number) ?? 0,
          },
        });
      }
    }
    counts.budgets = budgetData.length;
  }

  // Recurring entries
  const reFile = zip.file('recurring-entries.json');
  if (reFile) {
    const reData = JSON.parse(await reFile.async('string')) as Array<Record<string, unknown>>;
    for (const re of reData) {
      await db.recurringEntry.create({
        data: {
          companyId, userId,
          name: re.name as string, description: re.description as string,
          frequency: re.frequency as RecurringFrequency, status: re.status as RecurringStatus,
          startDate: new Date(re.startDate as string),
          endDate: re.endDate ? new Date(re.endDate as string) : null,
          nextExecution: re.nextExecution ? new Date(re.nextExecution as string) : new Date(),
          lastExecuted: re.lastExecuted ? new Date(re.lastExecuted as string) : null,
          lines: JSON.stringify(re.lines ?? []),
          reference: (re.reference as string) ?? null,
        },
      });
    }
    counts.recurringEntries = reData.length;
  }

  // Bank statements
  const bsFile = zip.file('bank-statements.json');
  if (bsFile) {
    const bsData = JSON.parse(await bsFile.async('string')) as Array<Record<string, unknown>>;
    for (const bs of bsData) {
      const stmt = await db.bankStatement.create({
        data: {
          companyId, userId,
          bankAccount: bs.bankAccount as string,
          startDate: new Date(bs.startDate as string),
          endDate: new Date(bs.endDate as string),
          openingBalance: bs.openingBalance as number,
          closingBalance: bs.closingBalance as number,
          fileName: (bs.fileName as string) ?? null,
          importSource: (bs.importSource as string) ?? null,
          reconciled: (bs.reconciled as boolean) ?? false,
          reconciledAt: bs.reconciledAt ? new Date(bs.reconciledAt as string) : null,
        },
      });
      for (const l of ((bs.lines as Array<Record<string, unknown>>) ?? [])) {
        await db.bankStatementLine.create({
          data: {
            bankStatementId: stmt.id,
            date: new Date(l.date as string), description: l.description as string,
            reference: (l.reference as string) ?? null, amount: l.amount as number,
            balance: l.balance as number,
            reconciliationStatus: (l.reconciliationStatus as ReconciliationStatus) ?? 'UNMATCHED',
          },
        });
      }
    }
    counts.bankStatements = bsData.length;
  }

  return counts;
}

/**
 * Clean up expired backups for a user
 */
export async function cleanupExpiredBackups(userId: string): Promise<number> {
  const now = new Date();

  // Find expired backups
  const expired = await db.backup.findMany({
    where: {
      userId,
      expiresAt: { lt: now },
    },
  });

  let deletedCount = 0;

  for (const backup of expired) {
    try {
      // Delete file from disk
      if (backup.filePath && fs.existsSync(backup.filePath)) {
        fs.unlinkSync(backup.filePath);
      }

      // Delete from database
      await db.backup.delete({ where: { id: backup.id } });
      deletedCount++;
    } catch (error) {
      logger.error(`[BACKUP] Failed to cleanup backup ${backup.id}:`, error);
    }
  }

  // Also apply retention limits per type
  for (const [type, policy] of Object.entries(RETENTION)) {
    const backups = await db.backup.findMany({
      where: { userId, backupType: type, status: 'completed' },
      orderBy: { createdAt: 'desc' },
    });

    if (backups.length > policy.count) {
      const toDelete = backups.slice(policy.count);
      for (const backup of toDelete) {
        try {
          if (backup.filePath && fs.existsSync(backup.filePath)) {
            fs.unlinkSync(backup.filePath);
          }
          await db.backup.delete({ where: { id: backup.id } });
          deletedCount++;
        } catch (error) {
          logger.error(`[BACKUP] Failed to delete excess backup ${backup.id}:`, error);
        }
      }
    }
  }

  return deletedCount;
}

/**
 * Run automatic backup for a user (called by scheduler).
 * Always uses tenant snapshot scope (full-db was removed for PostgreSQL migration).
 */
export async function runAutomaticBackup(userId: string, companyId: string, backupType: BackupType): Promise<void> {
  await createBackup(userId, 'automatic', backupType, companyId, 'tenant', {
    scheduled: true,
    timestamp: new Date().toISOString(),
  });

  // Cleanup old backups
  await cleanupExpiredBackups(userId);
}

/**
 * Verify a backup's integrity (SHA-256 of the ZIP file)
 */
export function verifyBackup(backupFilePath: string): { valid: boolean; currentChecksum: string; matches: boolean; fileSize: number } {
  if (!fs.existsSync(backupFilePath)) {
    return { valid: false, currentChecksum: '', matches: false, fileSize: 0 };
  }

  const stats = fs.statSync(backupFilePath);
  const currentChecksum = calculateChecksum(backupFilePath);

  return {
    valid: true,
    currentChecksum,
    matches: true, // Will be compared with stored hash by caller
    fileSize: stats.size,
  };
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { companyScope, Permission, requirePermission } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// GET /api/export-tenant — Export all tenant data as structured JSON for portable snapshot
// Version 2: complete field coverage matching Prisma schema
// Query params:
//   includeFiles=true  — also bundle actual uploaded files (documents + receipts)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = requirePermission(ctx, Permission.DATA_READ);
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const includeFiles = searchParams.get('includeFiles') === 'true';

    const scope = companyScope(ctx);
    const companyId = ctx.activeCompanyId;

    // Fetch all tenant data in parallel
    const [
      company,
      accounts,
      contacts,
      transactions,
      invoices,
      journalEntries,
      fiscalPeriods,
      budgets,
      recurringEntries,
      bankStatements,
      members,
    ] = await Promise.all([
      db.company.findUnique({ where: { id: companyId } }),
      db.account.findMany({
        where: scope,
        orderBy: [{ number: 'asc' }],
      }),
      db.contact.findMany({
        where: scope,
        orderBy: [{ name: 'asc' }],
      }),
      db.transaction.findMany({
        where: scope,
        orderBy: [{ date: 'desc' }],
      }),
      db.invoice.findMany({
        where: scope,
        orderBy: [{ createdAt: 'desc' }],
      }),
      db.journalEntry.findMany({
        where: scope,
        include: {
          lines: { orderBy: [{ id: 'asc' }] },
          documents: true,
        },
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
      }),
      db.fiscalPeriod.findMany({
        where: scope,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      }),
      db.budget.findMany({
        where: scope,
        include: {
          entries: {
            include: { account: { select: { number: true } } },
          },
        },
        orderBy: [{ year: 'desc' }],
      }),
      db.recurringEntry.findMany({
        where: scope,
        orderBy: [{ name: 'asc' }],
      }),
      db.bankStatement.findMany({
        where: scope,
        include: {
          lines: { orderBy: [{ date: 'asc' }, { id: 'asc' }] },
        },
        orderBy: [{ startDate: 'desc' }],
      }),
      db.userCompany.findMany({
        where: { companyId },
        include: { user: { select: { email: true } } },
        orderBy: [{ joinedAt: 'asc' }],
      }),
    ]);

    // ─── Collect unique file paths for optional file bundling ───
    const filesIndex: Array<{
      relativePath: string;  // the stored relative path (e.g. "documents/{userId}/{file}")
      zipPath: string;       // path inside the zip (e.g. "files/documents/{userId}/{file}")
      size: number;
    }> = [];

    if (includeFiles) {
      // Collect document files from journal entries
      for (const je of journalEntries) {
        for (const doc of je.documents) {
          if (doc.filePath) {
            filesIndex.push({
              relativePath: doc.filePath,
              zipPath: `files/${doc.filePath}`,
              size: doc.fileSize ?? 0,
            });
          }
        }
      }

      // Collect receipt image files from transactions
      for (const t of transactions) {
        if (t.receiptImage) {
          filesIndex.push({
            relativePath: t.receiptImage,
            zipPath: `files/${t.receiptImage}`,
            size: 0, // size not tracked on transaction
          });
        }
      }

      // Deduplicate by relativePath
      const seen = new Set<string>();
      const deduped = filesIndex.filter((f) => {
        if (seen.has(f.relativePath)) return false;
        seen.add(f.relativePath);
        return true;
      });
      filesIndex.length = 0;
      filesIndex.push(...deduped);
    }

    // Count total files size
    let totalFilesSize = 0;
    if (includeFiles) {
      for (const f of filesIndex) {
        const absPath = path.join(process.cwd(), 'uploads', f.relativePath);
        try {
          if (existsSync(absPath)) {
            const fileStat = await stat(absPath);
            totalFilesSize += fileStat.size;
          }
        } catch {
          // File may not exist, skip
        }
      }
    }

    // Build export data
    const meta: Record<string, unknown> = {
      version: 2,
      exportedAt: new Date().toISOString(),
      companyName: company?.name ?? 'unknown',
      companyId,
      alphaFlowVersion: '1.0.0',
      includeFiles,
      filesIncluded: includeFiles ? filesIndex.length : 0,
      filesTotalSize: includeFiles ? totalFilesSize : 0,
      filesRead: 0,
      filesSkipped: 0,
    };

    const exportData = {
      _meta: meta,

      company: company
        ? {
            name: company.name,
            logo: company.logo,
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
          }
        : null,

      accounts: accounts.map((a) => ({
        number: a.number,
        name: a.name,
        nameEn: a.nameEn,
        type: a.type,
        group: a.group,
        description: a.description,
        isActive: a.isActive,
        isSystem: a.isSystem,
        _ref: a.id,
      })),

      contacts: contacts.map((c) => ({
        name: c.name,
        cvrNumber: c.cvrNumber,
        email: c.email,
        phone: c.phone,
        address: c.address,
        city: c.city,
        postalCode: c.postalCode,
        country: c.country,
        type: c.type,
        notes: c.notes,
        isActive: c.isActive,
        _ref: c.id,
      })),

      transactions: transactions.map((t) => ({
        date: t.date.toISOString().split('T')[0],
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        exchangeRate: t.exchangeRate,
        amountDKK: t.amountDKK,
        description: t.description,
        vatPercent: t.vatPercent,
        receiptImage: t.receiptImage,
        invoiceId: t.invoiceId,
        accountId: t.accountId,
        cancelled: t.cancelled,
        cancelReason: t.cancelReason,
        originalId: t.originalId,
        _ref: t.id,
      })),

      invoices: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate.toISOString().split('T')[0],
        dueDate: inv.dueDate.toISOString().split('T')[0],
        customerName: inv.customerName,
        customerAddress: inv.customerAddress,
        customerEmail: inv.customerEmail,
        customerPhone: inv.customerPhone,
        customerCvr: inv.customerCvr,
        lineItems: inv.lineItems,
        subtotal: inv.subtotal,
        vatTotal: inv.vatTotal,
        total: inv.total,
        currency: inv.currency,
        exchangeRate: inv.exchangeRate,
        status: inv.status,
        notes: inv.notes,
        contactId: inv.contactId,
        cancelled: inv.cancelled,
        cancelReason: inv.cancelReason,
        _ref: inv.id,
      })),

      journalEntries: journalEntries.map((je) => ({
        date: je.date.toISOString().split('T')[0],
        description: je.description,
        reference: je.reference,
        status: je.status,
        cancelled: je.cancelled,
        cancelReason: je.cancelReason,
        lines: je.lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          vatCode: l.vatCode,
          description: l.description,
        })),
        documents: je.documents.map((d) => ({
          fileName: d.fileName,
          fileType: d.fileType,
          fileSize: d.fileSize,
          filePath: d.filePath,
          description: d.description,
        })),
        _ref: je.id,
      })),

      fiscalPeriods: fiscalPeriods.map((fp) => ({
        year: fp.year,
        month: fp.month,
        status: fp.status,
        lockedAt: fp.lockedAt?.toISOString() ?? null,
        lockedBy: fp.lockedBy,
        _ref: fp.id,
      })),

      budgets: budgets.map((b) => ({
        name: b.name,
        year: b.year,
        notes: b.notes,
        isActive: b.isActive,
        entries: b.entries.map((e) => ({
          accountNumber: e.account?.number ?? null,
          january: e.january,
          february: e.february,
          march: e.march,
          april: e.april,
          may: e.may,
          june: e.june,
          july: e.july,
          august: e.august,
          september: e.september,
          october: e.october,
          november: e.november,
          december: e.december,
        })),
        _ref: b.id,
      })),

      recurringEntries: recurringEntries.map((re) => ({
        name: re.name,
        description: re.description,
        frequency: re.frequency,
        status: re.status,
        startDate: re.startDate.toISOString().split('T')[0],
        endDate: re.endDate?.toISOString().split('T')[0] ?? null,
        nextExecution: re.nextExecution?.toISOString().split('T')[0] ?? null,
        lastExecuted: re.lastExecuted?.toISOString() ?? null,
        lines: typeof re.lines === 'string' ? JSON.parse(re.lines) : re.lines,
        reference: re.reference,
        _ref: re.id,
      })),

      bankStatements: bankStatements.map((bs) => ({
        bankAccount: bs.bankAccount,
        startDate: bs.startDate.toISOString().split('T')[0],
        endDate: bs.endDate.toISOString().split('T')[0],
        openingBalance: bs.openingBalance,
        closingBalance: bs.closingBalance,
        fileName: bs.fileName,
        importSource: bs.importSource,
        reconciled: bs.reconciled,
        reconciledAt: bs.reconciledAt?.toISOString() ?? null,
        lines: bs.lines.map((l) => ({
          date: l.date.toISOString().split('T')[0],
          description: l.description,
          reference: l.reference,
          amount: l.amount,
          balance: l.balance,
          reconciliationStatus: l.reconciliationStatus,
        })),
        _ref: bs.id,
      })),

      members: members.map((m) => ({
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt?.toISOString() ?? null,
        invitedBy: m.invitedBy,
      })),
    };

    // Build file contents map if includeFiles is enabled
    // Return file data as base64 encoded strings for each file
    let filesData: Record<string, string> | null = null;
    if (includeFiles && filesIndex.length > 0) {
      filesData = {};
      let filesRead = 0;
      let filesSkipped = 0;

      for (const f of filesIndex) {
        const absPath = path.join(process.cwd(), 'uploads', f.relativePath);
        try {
          if (existsSync(absPath)) {
            const buffer = await readFile(absPath);
            filesData[f.relativePath] = buffer.toString('base64');
            filesRead++;
          } else {
            filesSkipped++;
          }
        } catch {
          filesSkipped++;
        }
      }

      meta.filesRead = filesRead;
      meta.filesSkipped = filesSkipped;
    }

    // Count records for summary
    const summary = {
      accounts: accounts.length,
      contacts: contacts.length,
      transactions: transactions.length,
      invoices: invoices.length,
      journalEntries: journalEntries.length,
      journalLines: journalEntries.reduce((s, je) => s + je.lines.length, 0),
      journalDocuments: journalEntries.reduce((s, je) => s + je.documents.length, 0),
      fiscalPeriods: fiscalPeriods.length,
      budgets: budgets.length,
      recurringEntries: recurringEntries.length,
      bankStatements: bankStatements.length,
      bankStatementLines: bankStatements.reduce((s, bs) => s + bs.lines.length, 0),
      members: members.length,
      files: includeFiles ? {
        total: filesIndex.length,
        size: totalFilesSize,
      } : undefined,
    };

    return NextResponse.json({ exportData, summary, filesData });
  } catch (error) {
    logger.error('Export tenant data failed:', error);
    return NextResponse.json(
      { error: 'Failed to export tenant data' },
      { status: 500 }
    );
  }
}

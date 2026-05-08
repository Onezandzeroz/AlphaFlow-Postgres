import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditUpdate, auditCreate, auditLog, requestMetadata } from '@/lib/audit';
import { VATCode } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// GET /api/invoices/[id] - Get a specific invoice
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    
    const invoice = await db.invoice.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    logger.error('Failed to fetch invoice:', error);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}

// ─── Helper: Get effective companyId for data creation ───────────────
function effectiveCompanyId(ctx: { activeCompanyId: string | null; isOversightMode: boolean }): string {
  return ctx.activeCompanyId!;
}

// ─── Helper: Create accrual journal entry (on SENT) ──────────────────
//
// Accrual entry recognizes revenue when the invoice is sent (periodiseringsprincippet):
//   DEBIT  1200 Tilgodehavender   (gross amount incl. VAT)
//   CREDIT 4xxx Revenue accounts   (net per line item)
//   CREDIT 4510/4520 VAT accounts  (VAT amounts)
//
async function createAccrualJournalEntry(
  ctx: { id: string; activeCompanyId: string | null; isOversightMode: boolean; demoModeEnabled: boolean; isDemoCompany: boolean },
  existing: { id: string; invoiceNumber: string; customerName: string; issueDate: Date; lineItems: string },
): Promise<{ success: boolean; reason?: string; journalEntryId?: string; debit?: number; credit?: number }> {
  const lineItems = JSON.parse(existing.lineItems) as Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    vatPercent: number;
    accountId?: string;
  }>;

  // Look up required system accounts
  const receivablesAccount = await db.account.findFirst({
    where: { ...tenantFilter(ctx as any), number: '1200', isActive: true },
  });
  const outputVat25Account = await db.account.findFirst({
    where: { ...tenantFilter(ctx as any), number: '4510', isActive: true },
  });
  const outputVat12Account = await db.account.findFirst({
    where: { ...tenantFilter(ctx as any), number: '4520', isActive: true },
  });

  if (!receivablesAccount) {
    logger.warn(`[Invoice SENT] Account 1200 (Tilgodehavender) not found. Skipping accrual journal entry for ${existing.invoiceNumber}.`);
    return { success: false, reason: 'ACCOUNT_1200_NOT_FOUND' };
  }

  // Look up default revenue account for line items missing accountId
  const defaultRevenueAccount = await db.account.findFirst({
    where: { ...tenantFilter(ctx as any), number: '4100', isActive: true },
  });

  // Build journal entry lines
  const jeLines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    description: string;
    vatCode?: string | null;
  }> = [];
  let totalGross = 0;
  const vatByRate: Record<number, number> = {};

  for (const item of lineItems) {
    if (!item.description.trim() || item.unitPrice <= 0) continue;
    const netAmount = item.quantity * item.unitPrice;
    const vatAmount = (netAmount * item.vatPercent) / 100;
    const grossAmount = netAmount + vatAmount;

    // Credit the revenue account specified on the line item (default to 4100 if missing)
    // NOTE: Revenue lines must NOT have a vatCode — only the dedicated VAT account
    // lines (4510/4520) carry vatCode. The vat-register filters by account.group
    // (OUTPUT_VAT/INPUT_VAT), so tagging revenue lines would inflate VAT totals.
    const revenueAccountId = item.accountId || defaultRevenueAccount?.id;
    if (revenueAccountId) {
      jeLines.push({
        accountId: revenueAccountId,
        debit: 0,
        credit: netAmount,
        description: item.description,
        vatCode: null,
      });
    } else {
      logger.warn(`[Invoice SENT] Line item "${item.description}" has no accountId and no default revenue account (4100). Revenue credit will be missing for ${existing.invoiceNumber}.`);
    }

    // Accumulate VAT by rate
    if (vatAmount > 0) {
      vatByRate[item.vatPercent] = (vatByRate[item.vatPercent] || 0) + vatAmount;
    }

    totalGross += grossAmount;
  }

  // Debit line: Receivables (total gross amount)
  if (totalGross > 0) {
    jeLines.unshift({
      accountId: receivablesAccount.id,
      debit: totalGross,
      credit: 0,
      description: `${existing.invoiceNumber} – ${existing.customerName}`,
    });
  }

  // Credit lines: Output VAT by rate
  if (vatByRate[25] && outputVat25Account) {
    jeLines.push({
      accountId: outputVat25Account.id,
      debit: 0,
      credit: vatByRate[25],
      description: `${existing.invoiceNumber} – Udgående moms 25%`,
      vatCode: 'S25',
    });
  }
  if (vatByRate[12] && outputVat12Account) {
    jeLines.push({
      accountId: outputVat12Account.id,
      debit: 0,
      credit: vatByRate[12],
      description: `${existing.invoiceNumber} – Udgående moms 12%`,
      vatCode: 'S12',
    });
  }

  // Validate balance
  const totalDebit = jeLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = jeLines.reduce((s, l) => s + l.credit, 0);

  if (jeLines.length < 2 || Math.abs(totalDebit - totalCredit) >= 0.01) {
    logger.warn(
      `[Invoice SENT] Accrual journal entry for ${existing.invoiceNumber} is not balanced: debit=${totalDebit}, credit=${totalCredit}. Skipping.`
    );
    return { success: false, reason: 'UNBALANCED', debit: totalDebit, credit: totalCredit };
  }

  // Create the journal entry (reference = invoiceNumber, no suffix)
  const je = await db.journalEntry.create({
    data: {
      date: existing.issueDate,
      description: `Tilgodehavende – Faktura ${existing.invoiceNumber} – ${existing.customerName}`,
      reference: existing.invoiceNumber,
      status: 'POSTED',
      userId: ctx.id,
      companyId: effectiveCompanyId(ctx),
      isDemo: ctx.isDemoCompany || false,
      lines: {
        create: jeLines.map(l => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          vatCode: (l.vatCode as VATCode | undefined) ?? null,
        })),
      },
    },
  });

  await auditCreate(
    ctx.id,
    'JournalEntry',
    je.id,
    { autoCreated: true, invoiceId: existing.id, reference: existing.invoiceNumber, type: 'accrual', totalDebit, totalCredit },
    { source: 'invoice_sent' },
    ctx.activeCompanyId
  );

  return { success: true, journalEntryId: je.id };
}

// ─── Helper: Create cash receipt journal entry (on PAID) ─────────────
//
// Cash receipt entry records the payment into the bank:
//   DEBIT  1100 Bankkonto           (gross amount incl. VAT)
//   CREDIT 1200 Tilgodehavender     (gross amount – clears the receivable)
//
async function createCashReceiptJournalEntry(
  ctx: { id: string; activeCompanyId: string | null; isOversightMode: boolean; demoModeEnabled: boolean; isDemoCompany: boolean },
  existing: { id: string; invoiceNumber: string; customerName: string; issueDate: Date; total: number },
  paymentDate?: Date,
): Promise<boolean> {
  // Look up Bank account (1100) and Receivables account (1200)
  const bankAccount = await db.account.findFirst({
    where: { ...tenantFilter(ctx as any), number: '1100', isActive: true },
  });
  const receivablesAccount = await db.account.findFirst({
    where: { ...tenantFilter(ctx as any), number: '1200', isActive: true },
  });

  if (!bankAccount) {
    logger.warn(`[Invoice PAID] Account 1100 (Bankkonto) not found. Skipping cash receipt journal entry for ${existing.invoiceNumber}.`);
    return false;
  }
  if (!receivablesAccount) {
    logger.warn(`[Invoice PAID] Account 1200 (Tilgodehavender) not found. Skipping cash receipt journal entry for ${existing.invoiceNumber}.`);
    return false;
  }

  const grossAmount = existing.total;
  if (grossAmount <= 0) return false;

  const jeLines = [
    {
      accountId: bankAccount.id,
      debit: grossAmount,
      credit: 0,
      description: `${existing.invoiceNumber} – Indbetaling fra ${existing.customerName}`,
    },
    {
      accountId: receivablesAccount.id,
      debit: 0,
      credit: grossAmount,
      description: `${existing.invoiceNumber} – Udregning af tilgodehavende`,
    },
  ];

  // Reference uses "-IND" suffix to distinguish from the accrual entry
  const cashRef = `${existing.invoiceNumber}-IND`;

  const je = await db.journalEntry.create({
    data: {
      date: paymentDate || existing.issueDate,
      description: `Indbetaling – Faktura ${existing.invoiceNumber} – ${existing.customerName}`,
      reference: cashRef,
      status: 'POSTED',
      userId: ctx.id,
      companyId: effectiveCompanyId(ctx),
      isDemo: ctx.isDemoCompany || false,
      lines: {
        create: jeLines.map(l => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          vatCode: null,
        })),
      },
    },
  });

  await auditCreate(
    ctx.id,
    'JournalEntry',
    je.id,
    { autoCreated: true, invoiceId: existing.id, reference: cashRef, type: 'cash_receipt', totalDebit: grossAmount, totalCredit: grossAmount },
    { source: 'invoice_paid' },
    ctx.activeCompanyId
  );

  return true;
}

// ─── Helper: Cancel journal entries by reference ─────────────────────
async function cancelJournalEntries(
  ctx: any,
  references: string[],
  reason: string,
): Promise<number> {
  let cancelledCount = 0;

  for (const ref of references) {
    const jes = await db.journalEntry.findMany({
      where: {
        ...tenantFilter(ctx),
        reference: ref,
        cancelled: false,
      },
    });

    for (const je of jes) {
      await db.journalEntry.update({
        where: { id: je.id },
        data: {
          cancelled: true,
          status: 'CANCELLED',
          cancelReason: reason,
        },
      });
      cancelledCount++;

      // Audit each individual JE cancellation
      await auditLog({
        action: 'CANCEL',
        entityType: 'JournalEntry',
        entityId: je.id,
        userId: (ctx as any)?.id ?? '',
        companyId: (ctx as any)?.activeCompanyId ?? null,
        metadata: { reason, invoiceId: references.find(r => je.reference?.startsWith(r.replace('-IND', ''))), cancelReason: reason },
      });
    }
  }

  return cancelledCount;
}

// PUT /api/invoices/[id] - Update invoice (e.g., change status) — with audit trail
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await params;
    const body = await request.json();

    
    const existing = await db.invoice.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const previousStatus = existing.status;
    const newStatus = body.status;

    // Build old/new data for audit
    const oldData: Record<string, unknown> = { status: previousStatus, notes: existing.notes };
    const newData: Record<string, unknown> = {};
    if (newStatus) newData.status = newStatus;
    if (body.notes !== undefined) newData.notes = body.notes;
    if (body.customerName) newData.customerName = body.customerName;
    if (body.customerAddress !== undefined) newData.customerAddress = body.customerAddress;
    if (body.customerEmail !== undefined) newData.customerEmail = body.customerEmail;
    if (body.customerPhone !== undefined) newData.customerPhone = body.customerPhone;
    if (body.customerCvr !== undefined) newData.customerCvr = body.customerCvr;

    // Update the invoice
    const invoice = await db.invoice.update({
      where: { id },
      data: {
        ...(newStatus && { status: newStatus }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.customerName && { customerName: body.customerName }),
        ...(body.customerAddress !== undefined && { customerAddress: body.customerAddress }),
        ...(body.customerEmail !== undefined && { customerEmail: body.customerEmail }),
        ...(body.customerPhone !== undefined && { customerPhone: body.customerPhone }),
        ...(body.customerCvr !== undefined && { customerCvr: body.customerCvr }),
      },
    });

    // Audit log
    await auditUpdate(ctx.id, 'Invoice', id, oldData, newData, requestMetadata(request), ctx.activeCompanyId);

    const accrualRef = existing.invoiceNumber;
    const cashRef = `${existing.invoiceNumber}-IND`;

    // ─── STATUS TRANSITION: DRAFT → SENT ────────────────────────────
    // Create accrual journal entry (double-entry bookkeeping only)
    // This follows the accrual principle (periodiseringsprincippet):
    // Revenue is recognized when the invoice is sent, not when paid.
    if (newStatus === 'SENT' && previousStatus === 'DRAFT') {
      // Create accrual journal entry if none exists
      const existingJE = await db.journalEntry.findFirst({
        where: {
          ...tenantFilter(ctx),
          reference: accrualRef,
          cancelled: false,
        },
      });
      if (!existingJE) {
        await createAccrualJournalEntry(ctx, existing);
      }
    }

    // ─── STATUS TRANSITION: → PAID ──────────────────────────────────
    // Create cash receipt journal entry (Debit: Bank, Credit: Receivables)
    // Also ensure accrual entry exists (covers DRAFT → PAID edge case
    // and existing SENT invoices from before the accrual-on-SENT code change)
    if (newStatus === 'PAID' && previousStatus !== 'PAID') {
      const paymentDate = new Date(); // Today as payment date

      // Ensure accrual entry exists (covers DRAFT → PAID and old SENT → PAID)
      const existingAccrualJE = await db.journalEntry.findFirst({
        where: {
          ...tenantFilter(ctx),
          reference: accrualRef,
          cancelled: false,
        },
      });
      if (!existingAccrualJE) {
        await createAccrualJournalEntry(ctx, existing);
      }

      // Create cash receipt journal entry (Debit: Bank, Credit: Receivables)
      const existingCashJE = await db.journalEntry.findFirst({
        where: {
          ...tenantFilter(ctx),
          reference: cashRef,
          cancelled: false,
        },
      });
      if (!existingCashJE) {
        await createCashReceiptJournalEntry(ctx, existing, paymentDate);
      }
    }

    // ─── STATUS TRANSITION: PAID → SENT ─────────────────────────────
    // Cancel ONLY the cash receipt entry (reference = invoiceNumber-IND)
    // Keep the accrual entry (invoice is still outstanding)
    if (previousStatus === 'PAID' && newStatus === 'SENT') {
      await cancelJournalEntries(
        ctx,
        [cashRef],
        `Faktura ${existing.invoiceNumber} ændret fra BETALT til SENDT – indbetaling annulleret`,
      );
      // Do NOT cancel accrual — invoice is still sent/outstanding
    }

    // ─── STATUS TRANSITION: PAID → DRAFT / CANCELLED ────────────────
    // Cancel BOTH the cash receipt entry AND the accrual entry
    if (previousStatus === 'PAID' && newStatus && newStatus !== 'PAID' && newStatus !== 'SENT') {
      await cancelJournalEntries(
        ctx,
        [accrualRef, cashRef],
        `Faktura ${existing.invoiceNumber} ændret fra BETALT til ${newStatus}`,
      );
    }

    // ─── STATUS TRANSITION: SENT → DRAFT / CANCELLED ────────────────
    // Cancel the accrual entry (invoice no longer outstanding)
    if (previousStatus === 'SENT' && newStatus && newStatus !== 'SENT' && newStatus !== 'PAID') {
      await cancelJournalEntries(
        ctx,
        [accrualRef],
        `Faktura ${existing.invoiceNumber} ændret fra SENDT til ${newStatus}`,
      );
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    logger.error('Failed to update invoice:', error);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

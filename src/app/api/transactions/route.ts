import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditUpdate, auditCancel, auditDeleteAttempt, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { TransactionType, VATCode } from '@prisma/client';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { ensureInitialBackup } from '@/lib/backup-scheduler';
import { enrichTransactionsWithVAT } from '@/lib/vat-utils';

// GET - Fetch all non-cancelled transactions for the logged-in user
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    
    const transactions = await db.transaction.findMany({
      where: { ...tenantFilter(ctx), cancelled: false },
      orderBy: { date: 'desc' },
    });

    // Enrich with journal-entry-derived VAT data (single source of truth)
    const companyId = ctx.activeCompanyId;
    if (companyId) {
      try {
        const vatMap = await enrichTransactionsWithVAT(transactions, companyId);
        // Add journal-derived VAT to each transaction.
        // IMPORTANT: If no journal entry is found for a transaction, journalVAT
        // is set to null — we do NOT fall back to a fabricated amount × vatPercent
        // calculation. The summary totals are always correct via computeVATRegister().
        const enriched = transactions.map(t => {
          const jeVAT = vatMap.get(t.id);
          return {
            ...t,
            journalVAT: jeVAT
              ? { amount: jeVAT.vatAmount, code: jeVAT.vatCode, rate: jeVAT.vatRate }
              : null,
          };
        });
        return NextResponse.json({ transactions: enriched });
      } catch (e) {
        logger.warn('Failed to enrich transactions with journal VAT data:', e);
      }
    }

    return NextResponse.json({ transactions });
  } catch (error) {
    logger.error('Get transactions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new transaction
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const body = await request.json();
    const { type, date, amount, description, vatPercent, receiptImage, accountId } = body;

    if (!date || !amount || !description) {
      return NextResponse.json(
        { error: 'Date, amount, and description are required' },
        { status: 400 }
      );
    }

    // Validate transaction type
    const validTypes = Object.values(TransactionType);
    const txType = type && validTypes.includes(type) ? type : 'SALE';

    // Validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      return NextResponse.json(
        { error: 'Amount must be a valid number' },
        { status: 400 }
      );
    }

    // PURCHASE transactions require an accountId for double-entry bookkeeping.
    // This ensures every purchase is properly recorded with debit/credit lines
    // in the journal (single source of truth).
    if (txType === 'PURCHASE' && !accountId) {
      return NextResponse.json(
        { error: 'En omkostningskonto er påkrævet for at bogføre et indkøb. Vælg en konto fra kontoplanen (6xxx–9xxx). / An expense account is required to record a purchase. Select an account from the chart of accounts (6xxx–9xxx).' },
        { status: 400 }
      );
    }

    // Validate accountId — must belong to the same company
    if (accountId) {
      const account = await db.account.findFirst({
        where: { id: accountId, companyId: ctx.activeCompanyId! },
      });
      if (!account) {
        return NextResponse.json(
          { error: 'Invalid account' },
          { status: 400 }
        );
      }
    }

    
    const transaction = await db.transaction.create({
      data: {
        type: txType,
        date: new Date(date),
        amount: parsedAmount,
        description,
        vatPercent: vatPercent ?? 25.0,
        receiptImage,
        accountId: accountId || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
      },
    });

    // Create journal entry for PURCHASE transactions (double-entry bookkeeping)
    if (txType === 'PURCHASE') {
      const netAmount = parsedAmount; // stored amount is always net
      const vatPct = vatPercent ?? 25;
      const vatAmount = (netAmount * vatPct) / 100;
      const grossAmount = netAmount + vatAmount;

      // Only create JE if there's an actual amount
      if (netAmount > 0 && grossAmount > 0) {
        // Look up required accounts
        const [bankAccount, inputVatAccount, expenseAccount] = await Promise.all([
          db.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: '1100', isActive: true } }),
          db.account.findFirst({ where: { companyId: ctx.activeCompanyId!, number: vatPct === 12 ? '5420' : '5410', isActive: true } }),
          accountId ? db.account.findFirst({ where: { id: accountId } }) : Promise.resolve(null),
        ]);

        if (bankAccount) {
          const jeLines: Array<{ accountId: string; debit: number; credit: number; description: string; vatCode: VATCode | null }> = [];

          // Debit expense account (net amount)
          // NOTE: Expense lines must NOT have a vatCode — only the dedicated INPUT_VAT
          // account lines (5410/5420) carry vatCode. The vat-register filters by
          // account.group, so tagging expense lines would inflate input VAT totals.
          if (expenseAccount) {
            jeLines.push({ accountId: expenseAccount.id, debit: netAmount, credit: 0, description, vatCode: null });
          }

          // Debit input VAT account (VAT amount)
          if (inputVatAccount && vatAmount > 0) {
            const vatCode: VATCode = vatPct === 25 ? 'K25' : vatPct === 12 ? 'K12' : 'K0';
            jeLines.push({ accountId: inputVatAccount.id, debit: Math.round(vatAmount * 100) / 100, credit: 0, description: `${description} – Indgående moms ${vatPct}%`, vatCode });
          }

          // Credit bank account (gross amount)
          jeLines.push({ accountId: bankAccount.id, debit: 0, credit: Math.round(grossAmount * 100) / 100, description: `${description} – Betaling`, vatCode: null });

          // Only create if balanced (2 or more lines and debit === credit)
          const totalDebit = jeLines.reduce((s, l) => s + l.debit, 0);
          const totalCredit = jeLines.reduce((s, l) => s + l.credit, 0);

          if (jeLines.length >= 2 && Math.abs(totalDebit - totalCredit) < 0.01) {
            try {
              await db.journalEntry.create({
                data: {
                  date: new Date(date),
                  description: `Køb – ${description}`,
                  reference: `TX-${transaction.id.slice(0, 8)}`,
                  status: 'POSTED',
                  userId: ctx.id,
                  companyId: ctx.activeCompanyId!,
                  isDemo: ctx.isDemoCompany,
                  lines: { create: jeLines },
                },
              });
              logger.info(`[PURCHASE] Created journal entry for transaction ${transaction.id}: DR=${totalDebit}, CR=${totalCredit}`);
            } catch (jeError) {
              logger.error(`[PURCHASE] Failed to create journal entry for transaction ${transaction.id}:`, jeError);
            }
          }
        }
      }
    }

    // Audit log
    await auditCreate(
      ctx.id,
      'Transaction',
      transaction.id,
      { type: txType, date, amount: parsedAmount, description, vatPercent, receiptImage, accountId },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    // Trigger initial backup on first tenant data input
    ensureInitialBackup(ctx.activeCompanyId!, ctx.id);

    return NextResponse.json({ transaction });
  } catch (error) {
    logger.error('Create transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a transaction (e.g., attach receipt) — with audit trail
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const body = await request.json();
    const { id, receiptImage } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    
    const existing = await db.transaction.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Update only allowed fields
    const updateData: Record<string, unknown> = {};
    if (receiptImage !== undefined) {
      updateData.receiptImage = receiptImage;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const transaction = await db.transaction.update({
      where: { id },
      data: updateData,
    });

    // Audit log with old/new values
    await auditUpdate(
      ctx.id,
      'Transaction',
      id,
      { receiptImage: existing.receiptImage },
      { receiptImage },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ transaction });
  } catch (error) {
    logger.error('Update transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Soft-delete (cancel) a transaction — NOT a hard delete
// Per bogføringsloven, transactions must be preserved (cancelled, not deleted)
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const reason = searchParams.get('reason') || 'User requested cancellation';

    if (!id) {
      return NextResponse.json(
        { error: 'Transaction ID is required' },
        { status: 400 }
      );
    }

    // Verify ownership
    
    const transaction = await db.transaction.findFirst({
      where: { id, ...tenantFilter(ctx), cancelled: false },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found or already cancelled' },
        { status: 404 }
      );
    }

    // Soft-delete: mark as cancelled instead of deleting
    await db.transaction.update({
      where: { id },
      data: {
        cancelled: true,
        cancelReason: reason,
      },
    });

    // Audit log
    await auditCancel(
      ctx.id,
      'Transaction',
      id,
      reason,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ success: true, message: 'Transaction cancelled (soft-delete)' });
  } catch (error) {
    logger.error('Cancel transaction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

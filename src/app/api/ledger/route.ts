import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { AccountType } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

interface LedgerAccountRow {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

// GET - General Ledger Report (Trial Balance)
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    // Build date filter for journal entries
    const dateFilter: Record<string, Date> = {};
    if (fromStr) {
      dateFilter.gte = new Date(fromStr);
    }
    if (toStr) {
      const end = new Date(toStr);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    
    // Fetch all POSTED (non-cancelled) journal entries within date range
    const journalEntries = await db.journalEntry.findMany({
      where: {
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    // Aggregate debit/credit by account
    const accountMap = new Map<string, {
      accountId: string;
      accountNumber: string;
      accountName: string;
      accountType: string;
      debitTotal: number;
      creditTotal: number;
    }>();

    // Ensure all active accounts are included even if they have no entries
    const allAccounts = await db.account.findMany({
      where: { ...tenantFilter(ctx), isActive: true },
      orderBy: { number: 'asc' },
    });

    for (const account of allAccounts) {
      accountMap.set(account.id, {
        accountId: account.id,
        accountNumber: account.number,
        accountName: account.name,
        accountType: account.type,
        debitTotal: 0,
        creditTotal: 0,
      });
    }

    // Aggregate from journal entry lines
    for (const entry of journalEntries) {
      for (const line of entry.lines) {
        const existing = accountMap.get(line.accountId);
        if (existing) {
          existing.debitTotal += line.debit;
          existing.creditTotal += line.credit;
        } else {
          // Account might have been deactivated but still has entries
          accountMap.set(line.accountId, {
            accountId: line.account.id,
            accountNumber: line.account.number,
            accountName: line.account.name,
            accountType: line.account.type,
            debitTotal: line.debit,
            creditTotal: line.credit,
          });
        }
      }
    }

    // Build result array with calculated balances
    const accounts: LedgerAccountRow[] = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const acc of accountMap.values()) {
      let balance: number;
      // Balance = debitTotal - creditTotal for ASSET/EXPENSE
      // Balance = creditTotal - debitTotal for LIABILITY/EQUITY/REVENUE
      if (
        acc.accountType === AccountType.ASSET ||
        acc.accountType === AccountType.EXPENSE
      ) {
        balance = acc.debitTotal - acc.creditTotal;
      } else {
        balance = acc.creditTotal - acc.debitTotal;
      }

      // Round to 2 decimal places to avoid floating point issues
      acc.debitTotal = Math.round(acc.debitTotal * 100) / 100;
      acc.creditTotal = Math.round(acc.creditTotal * 100) / 100;
      balance = Math.round(balance * 100) / 100;

      totalDebit += acc.debitTotal;
      totalCredit += acc.creditTotal;

      accounts.push({
        accountId: acc.accountId,
        accountNumber: acc.accountNumber,
        accountName: acc.accountName,
        accountType: acc.accountType,
        debitTotal: acc.debitTotal,
        creditTotal: acc.creditTotal,
        balance,
      });
    }

    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;

    // A trial balance is balanced when totalDebit === totalCredit
    const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

    return NextResponse.json({
      accounts,
      totalDebit,
      totalCredit,
      balanced,
    });
  } catch (error) {
    logger.error('General ledger report error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

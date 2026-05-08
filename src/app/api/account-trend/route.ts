import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { AccountType } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/account-trend
 *
 * Returns monthly balance trends for a given account.
 *
 * Query params:
 *   - accountId: required, the account ID to get trends for
 *   - months: optional, number of months to look back (default 12)
 *
 * Returns {
 *   accountId, accountNumber, accountName,
 *   monthlyBalances: [{ month, balance }]
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');
    const monthsParam = searchParams.get('months');
    const months = monthsParam ? Math.min(Math.max(parseInt(monthsParam, 10) || 12, 1), 60) : 12;

    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing required parameter: accountId' },
        { status: 400 }
      );
    }

    
    // ─── Verify the account belongs to the user ───────────────────
    const account = await db.account.findFirst({
      where: {
        id: accountId,
        ...tenantFilter(ctx),
      },
      select: {
        id: true,
        number: true,
        name: true,
        type: true,
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    // ─── Compute date range ───────────────────────────────────────
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    // ─── Fetch all posted journal entry lines for this account ────
    const lines = await db.journalEntryLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          cancelled: false,
          date: {
            gte: startDate,
            lte: now,
          },
        },
      },
      include: {
        journalEntry: {
          select: { date: true },
        },
      },
      orderBy: {
        journalEntry: { date: 'asc' },
      },
    });

    // ─── Calculate monthly net change ─────────────────────────────
    const monthlyChanges = new Map<string, number>();

    // Initialize all months in the range with 0
    let d = new Date(startDate);
    while (d <= now) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyChanges.has(key)) {
        monthlyChanges.set(key, 0);
      }
      d.setMonth(d.getMonth() + 1);
    }

    // Aggregate by month
    for (const line of lines) {
      const date = line.journalEntry.date;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      let change = 0;
      if (account.type === AccountType.ASSET || account.type === AccountType.EXPENSE) {
        // Debit increases balance
        change = (line.debit || 0) - (line.credit || 0);
      } else {
        // Credit increases balance (Liability, Equity, Revenue)
        change = (line.credit || 0) - (line.debit || 0);
      }

      monthlyChanges.set(key, r((monthlyChanges.get(key) || 0) + change));
    }

    // ─── Get balance at start date (for running balance) ──────────
    const balanceBeforeStart = await db.journalEntryLine.aggregate({
      _sum: { debit: true, credit: true },
      where: {
        accountId: account.id,
        journalEntry: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          cancelled: false,
          date: { lt: startDate },
        },
      },
    });

    let runningBalance: number;
    if (account.type === AccountType.ASSET || account.type === AccountType.EXPENSE) {
      runningBalance = r((balanceBeforeStart._sum.debit || 0) - (balanceBeforeStart._sum.credit || 0));
    } else {
      runningBalance = r((balanceBeforeStart._sum.credit || 0) - (balanceBeforeStart._sum.debit || 0));
    }

    // ─── Build monthly balances (running balance) ─────────────────
    const sortedMonths = [...monthlyChanges.keys()].sort();
    const monthlyBalances = sortedMonths.map((month) => {
      runningBalance = r(runningBalance + (monthlyChanges.get(month) || 0));
      return { month, balance: runningBalance };
    });

    return NextResponse.json({
      accountId: account.id,
      accountNumber: account.number,
      accountName: account.name,
      monthlyBalances,
    });
  } catch (error) {
    logger.error('Account trend API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

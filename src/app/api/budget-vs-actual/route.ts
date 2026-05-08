import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { AccountType } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

const r = (n: number) => Math.round(n * 100) / 100;

// Month field names on BudgetEntry model
const MONTH_FIELDS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

type MonthField = typeof MONTH_FIELDS[number];

/**
 * GET /api/budget-vs-actual
 *
 * Compares budgeted amounts to actual spending per account category.
 *
 * Query params:
 *   - year: budget year (defaults to current year)
 *
 * Returns array of {
 *   accountNumber, accountName, budgetAmount, actualAmount,
 *   variance, variancePercent
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    if (isNaN(year) || year < 2020 || year > 2030) {
      return NextResponse.json(
        { error: 'Invalid year. Must be between 2020 and 2030.' },
        { status: 400 }
      );
    }

    
    // ─── Find the budget for this year ────────────────────────────
    const budget = await db.budget.findFirst({
      where: {
        ...tenantFilter(ctx),
        year,
        isActive: true,
      },
      include: {
        entries: {
          include: {
            account: true,
          },
        },
      },
    });

    if (!budget) {
      return NextResponse.json([]);
    }

    // ─── Gather account IDs from budget entries ────────────────────
    const accountIds = budget.entries.map((e) => e.accountId);

    if (accountIds.length === 0) {
      return NextResponse.json([]);
    }

    // ─── Compute actual amounts per account for the year ───────────
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    // Fetch account types for natural balance calculation
    const accounts = await db.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, type: true },
    });
    const accountTypeMap = new Map(accounts.map((a) => [a.id, a.type]));

    // Fetch journal entry lines that reference our budget accounts
    const lines = await db.journalEntryLine.findMany({
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          cancelled: false,
          date: {
            gte: yearStart,
            lte: yearEnd,
          },
        },
      },
    });

    // Aggregate actual amounts by account
    const actualsByAccount = new Map<string, number>();
    for (const line of lines) {
      const accountType = accountTypeMap.get(line.accountId);
      let actual = 0;
      if (accountType === AccountType.REVENUE) {
        actual = (line.credit || 0) - (line.debit || 0);
      } else if (accountType === AccountType.EXPENSE) {
        actual = (line.debit || 0) - (line.credit || 0);
      } else if (accountType === AccountType.ASSET) {
        actual = (line.debit || 0) - (line.credit || 0);
      } else if (accountType === AccountType.LIABILITY) {
        actual = (line.credit || 0) - (line.debit || 0);
      } else if (accountType === AccountType.EQUITY) {
        actual = (line.credit || 0) - (line.debit || 0);
      }
      actualsByAccount.set(
        line.accountId,
        r((actualsByAccount.get(line.accountId) || 0) + actual)
      );
    }

    // ─── Build comparison rows ─────────────────────────────────────
    const results = budget.entries.map((entry) => {
      // Sum all months for the total budget amount
      let budgetAmount = 0;
      for (const monthField of MONTH_FIELDS) {
        budgetAmount += (entry[monthField] as number) || 0;
      }
      budgetAmount = r(budgetAmount);

      const actualAmount = r(actualsByAccount.get(entry.accountId) || 0);
      const variance = r(actualAmount - budgetAmount);
      const variancePercent = budgetAmount !== 0
        ? r((variance / Math.abs(budgetAmount)) * 100)
        : actualAmount !== 0 ? (actualAmount > 0 ? 100 : -100) : 0;

      return {
        accountNumber: entry.account.number,
        accountName: entry.account.name,
        budgetAmount,
        actualAmount,
        variance,
        variancePercent,
      };
    });

    // Sort by account number
    results.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

    return NextResponse.json(results);
  } catch (error) {
    logger.error('Budget vs Actual API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

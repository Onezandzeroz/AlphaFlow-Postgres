import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/expense-categories
 *
 * Returns expense breakdown by account group with monthly trends.
 * Query params:
 *   - from: start date (yyyy-MM-dd)
 *   - to: end date (yyyy-MM-dd)
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');

    const now = new Date();
    const from = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), 0, 1);
    const to = toParam ? new Date(toParam) : now;

    
    // Fetch all expense accounts for the user
    const expenseAccounts = await db.account.findMany({
      where: {
        ...tenantFilter(ctx),
        type: 'EXPENSE',
      },
      select: {
        id: true,
        number: true,
        name: true,
        group: true,
      },
      orderBy: { number: 'asc' },
    });

    const accountIds = expenseAccounts.map((a) => a.id);
    const accountMap = new Map(expenseAccounts.map((a) => [a.id, a]));

    if (accountIds.length === 0) {
      return NextResponse.json({ categories: [], monthlyTrend: [], totalExpenses: 0 });
    }

    // Fetch posted journal entry lines for expense accounts in date range
    const lines = await db.journalEntryLine.findMany({
      where: {
        accountId: { in: accountIds },
        journalEntry: {
          ...tenantFilter(ctx),
          status: 'POSTED',
          cancelled: false,
          date: { gte: from, lte: to },
        },
      },
      include: {
        journalEntry: {
          select: { date: true },
        },
      },
    });

    // Aggregate by account group
    const categoryMap = new Map<string, {
      name: string;
      total: number;
      accounts: Array<{ number: string; name: string; amount: number }>;
      monthlyData: Record<string, number>;
    }>();

    let totalExpenses = 0;

    for (const line of lines) {
      const account = accountMap.get(line.accountId);
      if (!account) continue;

      // For expense accounts, debit increases the balance
      const amount = (line.debit || 0) - (line.credit || 0);
      if (amount <= 0) continue;

      totalExpenses += amount;

      const groupName = account.group || 'Other';
      const month = line.journalEntry.date.toISOString().substring(0, 7); // yyyy-MM

      if (!categoryMap.has(groupName)) {
        categoryMap.set(groupName, {
          name: groupName,
          total: 0,
          accounts: [],
          monthlyData: {},
        });
      }

      const group = categoryMap.get(groupName)!;
      group.total = r(group.total + amount);

      // Add to monthly data
      group.monthlyData[month] = r((group.monthlyData[month] || 0) + amount);

      // Add or update account-level data
      const existingAccount = group.accounts.find((a) => a.number === account.number);
      if (existingAccount) {
        existingAccount.amount = r(existingAccount.amount + amount);
      } else {
        group.accounts.push({
          number: account.number,
          name: account.name,
          amount: r(amount),
        });
      }
    }

    // Sort categories by total and calculate percentages
    const categories = Array.from(categoryMap.values())
      .sort((a, b) => b.total - a.total)
      .map((cat) => ({
        name: cat.name,
        total: cat.total,
        percentage: totalExpenses > 0 ? r((cat.total / totalExpenses) * 100) : 0,
        accounts: cat.accounts.sort((a, b) => b.amount - a.amount),
        monthlyData: cat.monthlyData,
      }));

    // Build monthly trend data
    const monthlyTrendMap = new Map<string, { month: string; total: number; byCategory: Record<string, number> }>();

    for (const line of lines) {
      const account = accountMap.get(line.accountId);
      if (!account) continue;

      const amount = (line.debit || 0) - (line.credit || 0);
      if (amount <= 0) continue;

      const month = line.journalEntry.date.toISOString().substring(0, 7);
      const groupName = account.group || 'Other';

      if (!monthlyTrendMap.has(month)) {
        monthlyTrendMap.set(month, { month, total: 0, byCategory: {} });
      }

      const monthData = monthlyTrendMap.get(month)!;
      monthData.total = r(monthData.total + amount);
      monthData.byCategory[groupName] = r((monthData.byCategory[groupName] || 0) + amount);
    }

    const monthlyTrend = Array.from(monthlyTrendMap.values())
      .sort((a, b) => a.month.localeCompare(b.month));

    return NextResponse.json({
      categories,
      monthlyTrend,
      totalExpenses: r(totalExpenses),
    });
  } catch (error) {
    logger.error('Expense categories GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

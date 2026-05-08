import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/profit-loss
 *
 * Returns Profit & Loss waterfall data for the dashboard widget.
 * Shows revenue, COGS, operating expenses, financial items, and net result.
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

    
    // Fetch all accounts for the user
    const accounts = await db.account.findMany({
      where: {
        ...tenantFilter(ctx),
        type: { in: ['REVENUE', 'EXPENSE'] },
      },
      select: { id: true, number: true, name: true, type: true, group: true },
      orderBy: { number: 'asc' },
    });

    const accountIds = accounts.map((a) => a.id);
    if (accountIds.length === 0) {
      return NextResponse.json({ waterfall: [], summary: null });
    }

    // Fetch posted journal entry lines
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
        journalEntry: { select: { date: true } },
      },
    });

    // Aggregate amounts by account group
    const groupMap = new Map<string, { name: string; type: string; total: number }>();

    for (const line of lines) {
      const account = accounts.find((a) => a.id === line.accountId);
      if (!account) continue;

      let amount = 0;
      if (account.type === 'REVENUE') {
        amount = (line.credit || 0) - (line.debit || 0); // Credit increases revenue
      } else if (account.type === 'EXPENSE') {
        amount = (line.debit || 0) - (line.credit || 0); // Debit increases expense
      }

      const groupName = account.group || account.type;
      const existing = groupMap.get(groupName);
      if (existing) {
        existing.total = r(existing.total + amount);
      } else {
        groupMap.set(groupName, { name: groupName, type: account.type, total: r(amount) });
      }
    }

    // Build waterfall data
    const waterfall: Array<{
      name: string;
      type: 'revenue' | 'expense' | 'subtotal' | 'net';
      amount: number;
      cumulative: number;
    }> = [];

    let cumulative = 0;

    // Revenue items first (positive)
    const revenueGroups = Array.from(groupMap.values())
      .filter((g) => g.type === 'REVENUE')
      .sort((a, b) => b.total - a.total);

    for (const group of revenueGroups) {
      cumulative = r(cumulative + group.total);
      waterfall.push({
        name: group.name,
        type: 'revenue',
        amount: group.total,
        cumulative,
      });
    }

    // Gross profit subtotal
    const totalRevenue = r(revenueGroups.reduce((sum, g) => sum + g.total, 0));
    if (revenueGroups.length > 1) {
      waterfall.push({
        name: 'Gross Profit',
        type: 'subtotal',
        amount: totalRevenue,
        cumulative,
      });
    }

    // Expense items (negative)
    const expenseGroups = Array.from(groupMap.values())
      .filter((g) => g.type === 'EXPENSE')
      .sort((a, b) => b.total - a.total);

    for (const group of expenseGroups) {
      cumulative = r(cumulative - group.total);
      waterfall.push({
        name: group.name,
        type: 'expense',
        amount: -group.total,
        cumulative,
      });
    }

    const totalExpenses = r(expenseGroups.reduce((sum, g) => sum + g.total, 0));
    const netResult = r(totalRevenue - totalExpenses);

    // Net result
    waterfall.push({
      name: 'Net Result',
      type: 'net',
      amount: netResult,
      cumulative: netResult,
    });

    // Summary
    const summary = {
      totalRevenue,
      totalExpenses,
      netResult,
      revenueCount: revenueGroups.length,
      expenseCount: expenseGroups.length,
      marginPercent: totalRevenue > 0 ? r((netResult / totalRevenue) * 100) : 0,
    };

    return NextResponse.json({ waterfall, summary });
  } catch (error) {
    logger.error('Profit & Loss GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

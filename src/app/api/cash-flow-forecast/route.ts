import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/cash-flow-forecast
 *
 * Analyzes past 3 months of transactions and projects next month's expected
 * income/expenses. Returns projected vs actual comparison data.
 *
 * Query params:
 *   - from: start date (yyyy-MM-dd) — optional
 *   - to: end date (yyyy-MM-dd) — optional
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    
    // ─── Fetch all accounts ─────────────────────────────────────────
    const accounts = await db.account.findMany({
      where: {
        ...tenantFilter(ctx),
        isActive: true,
      },
    });

    const accountInfo = new Map<string, { number: string; group: AccountGroup }>();
    for (const acc of accounts) {
      accountInfo.set(acc.id, {
        number: acc.number,
        group: acc.group,
      });
    }

    // ─── Fetch all posted journal entries ────────────────────────────
    const entries = await db.journalEntry.findMany({
      where: {
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
      },
      include: {
        lines: {
          include: { account: true },
        },
      },
      orderBy: { date: 'asc' },
    });

    // Track accounts referenced in entries
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (!accountInfo.has(line.accountId)) {
          accountInfo.set(line.accountId, {
            number: line.account.number,
            group: line.account.group,
          });
        }
      }
    }

    // ─── Group definitions ───────────────────────────────────────────
    const revenueGroups: AccountGroup[] = [
      AccountGroup.SALES_REVENUE,
      AccountGroup.OTHER_REVENUE,
      AccountGroup.FINANCIAL_INCOME,
    ];
    const expenseGroups: AccountGroup[] = [
      AccountGroup.COST_OF_GOODS,
      AccountGroup.PERSONNEL,
      AccountGroup.OTHER_OPERATING,
      AccountGroup.FINANCIAL_EXPENSE,
      AccountGroup.TAX,
    ];

    // ─── Compute monthly revenue/expenses from journal entries ──────
    const monthlyData = new Map<string, { revenue: number; expenses: number }>();

    for (const entry of entries) {
      const date = new Date(entry.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyData.has(monthKey)) {
        monthlyData.set(monthKey, { revenue: 0, expenses: 0 });
      }

      const monthData = monthlyData.get(monthKey)!;

      for (const line of entry.lines) {
        const info = accountInfo.get(line.accountId);
        if (!info) continue;

        const dr = line.debit || 0;
        const cr = line.credit || 0;

        if (revenueGroups.includes(info.group)) {
          monthData.revenue += cr - dr;
        } else if (expenseGroups.includes(info.group)) {
          monthData.expenses += dr - cr;
        }
      }
    }

    // Sort months chronologically
    const sortedMonths = Array.from(monthlyData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));

    // ─── Get last 3 months actual data ──────────────────────────────
    const last3Months = sortedMonths.slice(-3);

    if (last3Months.length === 0) {
      return NextResponse.json({
        historical: [],
        projected: null,
        summary: null,
      });
    }

    // Calculate averages from available months
    const avgRevenue = r(last3Months.reduce((sum, m) => sum + m[1].revenue, 0) / last3Months.length);
    const avgExpenses = r(last3Months.reduce((sum, m) => sum + m[1].expenses, 0) / last3Months.length);

    // Calculate trend (linear regression slope for revenue and expenses)
    let revenueTrend = 0;
    let expenseTrend = 0;
    if (last3Months.length >= 2) {
      // Simple linear trend
      const revValues = last3Months.map(m => m[1].revenue);
      const expValues = last3Months.map(m => m[1].expenses);

      // Average change per month
      revenueTrend = last3Months.length > 1
        ? r((revValues[revValues.length - 1] - revValues[0]) / (last3Months.length - 1))
        : 0;
      expenseTrend = last3Months.length > 1
        ? r((expValues[expValues.length - 1] - expValues[0]) / (last3Months.length - 1))
        : 0;
    }

    // ─── Project next month ──────────────────────────────────────────
    const lastMonthKey = last3Months[last3Months.length - 1][0];
    const [lastYear, lastMonth] = lastMonthKey.split('-').map(Number);
    const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
    const nextYear = lastMonth === 12 ? lastYear + 1 : lastYear;
    const nextMonthKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;

    // Projected = average with trend adjustment
    const projectedRevenue = r(Math.max(0, avgRevenue + revenueTrend * 0.5));
    const projectedExpenses = r(Math.max(0, avgExpenses + expenseTrend * 0.5));
    const projectedNet = r(projectedRevenue - projectedExpenses);

    // ─── Build response ──────────────────────────────────────────────
    const historical = last3Months.map(([month, data], idx) => ({
      month,
      revenue: r(data.revenue),
      expenses: r(data.expenses),
      net: r(data.revenue - data.expenses),
      label: new Date(month + '-01').toLocaleDateString('da-DK', { month: 'short' }),
      isActual: true,
      index: idx,
    }));

    // Include more historical months for chart context (up to 6)
    const allHistorical = sortedMonths.slice(-6).map(([month, data]) => ({
      month,
      revenue: r(data.revenue),
      expenses: r(data.expenses),
      net: r(data.revenue - data.expenses),
      label: new Date(month + '-01').toLocaleDateString('da-DK', { month: 'short' }),
      isActual: true,
    }));

    const projected = {
      month: nextMonthKey,
      revenue: projectedRevenue,
      expenses: projectedExpenses,
      net: projectedNet,
      label: new Date(nextMonthKey + '-01').toLocaleDateString('da-DK', { month: 'short' }),
      isActual: false,
    };

    // Chart data: historical + projected
    const chartData = [
      ...allHistorical,
      projected,
    ];

    const currentMonthActual = last3Months.length > 0
      ? last3Months[last3Months.length - 1][1]
      : null;

    return NextResponse.json({
      historical: allHistorical,
      last3Months: historical,
      projected,
      chartData,
      summary: {
        avgRevenue,
        avgExpenses,
        revenueTrend,
        expenseTrend,
        projectedNet,
        confidence: last3Months.length >= 3 ? 'high' : last3Months.length >= 2 ? 'medium' : 'low',
        dataPoints: last3Months.length,
      },
    });
  } catch (error) {
    logger.error('Cash flow forecast API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

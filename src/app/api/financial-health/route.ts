import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { db } from '@/lib/db';
import { AccountType, AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

const r = (n: number) => Math.round(n * 100) / 100;

/**
 * GET /api/financial-health
 *
 * Calculates and returns three key financial health metrics:
 * - Liquidity ratio (total current assets / total current liabilities)
 * - Profit margin (net income / total revenue as percentage)
 * - Cash flow trend (improving | stable | declining based on last 3 months)
 *
 * Query params:
 *   - from: start date (yyyy-MM-dd) — optional, defaults to year start
 *   - to: end date (yyyy-MM-dd) — optional, defaults to today
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
    to.setHours(23, 59, 59, 999); // Include all entries on the "to" date

    
    // ─── Fetch all accounts ─────────────────────────────────────────
    const accounts = await db.account.findMany({
      where: {
        ...tenantFilter(ctx),
        isActive: true,
      },
    });

    const accountInfo = new Map<string, { number: string; type: AccountType; group: AccountGroup }>();
    for (const acc of accounts) {
      accountInfo.set(acc.id, {
        number: acc.number,
        type: acc.type,
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
            type: line.account.type,
            group: line.account.group,
          });
        }
      }
    }

    // ─── Compute balance snapshot at "to" date ──────────────────────
    const balances = new Map<string, { debit: number; credit: number }>();
    for (const accId of accountInfo.keys()) {
      balances.set(accId, { debit: 0, credit: 0 });
    }

    for (const entry of entries) {
      if (entry.date > to) continue;
      for (const line of entry.lines) {
        const bal = balances.get(line.accountId);
        if (bal) {
          bal.debit += line.debit || 0;
          bal.credit += line.credit || 0;
        }
      }
    }

    function getBalance(accountId: string): number {
      const bal = balances.get(accountId);
      if (!bal) return 0;
      const info = accountInfo.get(accountId);
      if (!info) return 0;
      if (info.type === AccountType.ASSET || info.type === AccountType.EXPENSE) {
        return r(bal.debit - bal.credit);
      } else {
        return r(bal.credit - bal.debit);
      }
    }

    function sumByGroups(groups: AccountGroup[]): number {
      let total = 0;
      for (const [accId, info] of accountInfo) {
        if (groups.includes(info.group)) {
          total += getBalance(accId);
        }
      }
      return r(total);
    }

    // ─── 1. Liquidity Ratio ─────────────────────────────────────────
    // liquidityRatio = total current assets / total current liabilities
    const currentAssetGroups: AccountGroup[] = [
      AccountGroup.CASH,
      AccountGroup.BANK,
      AccountGroup.RECEIVABLES,
      AccountGroup.OTHER_ASSETS,
    ];
    const currentLiabilityGroups: AccountGroup[] = [
      AccountGroup.PAYABLES,
      AccountGroup.SHORT_TERM_DEBT,
      AccountGroup.OTHER_LIABILITIES,
      AccountGroup.OUTPUT_VAT,
      AccountGroup.INPUT_VAT,
    ];

    const totalCurrentAssets = sumByGroups(currentAssetGroups);
    const totalCurrentLiabilities = sumByGroups(currentLiabilityGroups);
    const liquidityRatio = totalCurrentLiabilities !== 0
      ? r(totalCurrentAssets / totalCurrentLiabilities)
      : totalCurrentAssets > 0 ? 99 : 0;

    // ─── 2. Profit Margin (period-specific P&L) ──────────────────────
    // profitMargin = periodNetIncome / periodRevenue (as percentage)
    // Uses entries in the period [from, to] instead of cumulative balances.
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

    // Compute period-specific P&L (only entries in [from, to])
    let periodRevenue = 0;
    let periodExpenses = 0;
    for (const entry of entries) {
      if (entry.date < from || entry.date > to) continue;
      for (const line of entry.lines) {
        const info = accountInfo.get(line.accountId);
        if (!info) continue;
        const dr = line.debit || 0;
        const cr = line.credit || 0;
        if (revenueGroups.includes(info.group)) {
          periodRevenue += cr - dr;
        } else if (expenseGroups.includes(info.group)) {
          periodExpenses += dr - cr;
        }
      }
    }
    const totalRevenue = r(periodRevenue);
    const totalExpenses = r(periodExpenses);
    const netIncome = r(totalRevenue - totalExpenses);
    const profitMargin = totalRevenue !== 0 ? r((netIncome / totalRevenue) * 100) : 0;

    // ─── 3. Cash Flow Trend ─────────────────────────────────────────
    // cashFlowTrend = 'improving' | 'stable' | 'declining' (compare last 3 months)
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const twoMonthsAgo = new Date(now);
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    function getMonthNet(monthStart: Date): number {
      const monthEnd = new Date(monthStart);
      monthEnd.setMonth(monthEnd.getMonth() + 1);
      let revenue = 0;
      let expenses = 0;

      for (const entry of entries) {
        if (entry.date < monthStart || entry.date >= monthEnd) continue;
        for (const line of entry.lines) {
          const info = accountInfo.get(line.accountId);
          if (!info) continue;
          const dr = line.debit || 0;
          const cr = line.credit || 0;

          if (revenueGroups.includes(info.group)) {
            revenue += cr - dr;
          } else if (expenseGroups.includes(info.group)) {
            expenses += dr - cr;
          }
        }
      }
      return r(revenue - expenses);
    }

    const month1Net = getMonthNet(threeMonthsAgo);
    const month2Net = getMonthNet(twoMonthsAgo);
    const month3Net = getMonthNet(oneMonthAgo);

    let cashFlowTrend: 'improving' | 'stable' | 'declining';
    const avgChange = r((month2Net - month1Net + month3Net - month2Net) / 2);
    if (avgChange > 500) {
      cashFlowTrend = 'improving';
    } else if (avgChange < -500) {
      cashFlowTrend = 'declining';
    } else {
      cashFlowTrend = 'stable';
    }

    return NextResponse.json({
      liquidityRatio: r(liquidityRatio),
      totalCurrentAssets: r(totalCurrentAssets),
      totalCurrentLiabilities: r(totalCurrentLiabilities),
      profitMargin: r(profitMargin),
      netIncome: r(netIncome),
      totalRevenue: r(totalRevenue),
      totalExpenses: r(totalExpenses),
      cashFlowTrend,
      monthlyNet: [month1Net, month2Net, month3Net],
    });
  } catch (error) {
    logger.error('Financial health API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

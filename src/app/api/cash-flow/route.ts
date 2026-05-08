import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { AccountType, AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission } from '@/lib/rbac';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Cash Flow Statement API (Likviditetsopgørelse)
 *
 * Uses the indirect method as required for Danish financial reporting.
 * Computes cash flow from changes in balance sheet accounts between two dates.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    if (!fromStr || !toStr) {
      return NextResponse.json(
        { error: 'Missing required query parameters: from and to (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const fromDate = new Date(fromStr);
    const toDate = new Date(toStr);
    toDate.setHours(23, 59, 59, 999);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    if (fromDate >= toDate) {
      return NextResponse.json(
        { error: 'from date must be before to date.' },
        { status: 400 }
      );
    }

    // ─── Fetch all accounts ─────────────────────────────────────────
        const accounts = await db.account.findMany({
      where: { ...tenantFilter(ctx), isActive: true },
    });

    // Build account info map: id → { number, type, group }
    const accountInfo = new Map<string, { number: string; type: AccountType; group: AccountGroup }>();
    for (const acc of accounts) {
      accountInfo.set(acc.id, {
        number: acc.number,
        type: acc.type,
        group: acc.group,
      });
    }

    // ─── Fetch all posted entries up to toDate ─────────────────────
    const entries = await db.journalEntry.findMany({
      where: {
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        date: { lte: toDate },
      },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });

    // Ensure accounts referenced in entries are also tracked
    // (they may have been deactivated but still hold balances)
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

    // ─── Compute two balance snapshots ─────────────────────────────
    // beginBalances: all entries with date < fromDate (before period)
    // endBalances:   all entries with date <= toDate (end of period)
    const beginBalances = new Map<string, { debit: number; credit: number }>();
    const endBalances = new Map<string, { debit: number; credit: number }>();

    for (const accId of accountInfo.keys()) {
      beginBalances.set(accId, { debit: 0, credit: 0 });
      endBalances.set(accId, { debit: 0, credit: 0 });
    }

    for (const entry of entries) {
      for (const line of entry.lines) {
        const dr = line.debit || 0;
        const cr = line.credit || 0;

        // Always add to end balances
        const endBal = endBalances.get(line.accountId);
        if (endBal) {
          endBal.debit += dr;
          endBal.credit += cr;
        }

        // Only add to begin balances if entry is BEFORE the from date
        if (entry.date < fromDate) {
          const beginBal = beginBalances.get(line.accountId);
          if (beginBal) {
            beginBal.debit += dr;
            beginBal.credit += cr;
          }
        }
      }
    }

    // ─── Helper: compute natural balance for an account ───────────
    function getBalance(
      balances: Map<string, { debit: number; credit: number }>,
      accountId: string
    ): number {
      const bal = balances.get(accountId);
      if (!bal) return 0;
      const info = accountInfo.get(accountId);
      if (!info) return 0;

      if (info.type === AccountType.ASSET || info.type === AccountType.EXPENSE) {
        return r(bal.debit - bal.credit);
      } else {
        // LIABILITY, EQUITY, REVENUE
        return r(bal.credit - bal.debit);
      }
    }

    // ─── Helper: sum balances for a set of account groups ─────────
    function sumByGroups(
      balances: Map<string, { debit: number; credit: number }>,
      groups: AccountGroup[]
    ): number {
      let total = 0;
      for (const [accId, info] of accountInfo) {
        if (groups.includes(info.group)) {
          total += getBalance(balances, accId);
        }
      }
      return r(total);
    }

    // ─── Net Income from P&L ──────────────────────────────────────
    // Compute the income statement for the period (from <= date <= to).
    // Revenue accounts: credit - debit (natural balance is credit)
    // Expense accounts: debit - credit (natural balance is debit)
    const pnlRevenueGroups: AccountGroup[] = [
      AccountGroup.SALES_REVENUE,
      AccountGroup.OTHER_REVENUE,
      AccountGroup.FINANCIAL_INCOME,
    ];
    const pnlExpenseGroups: AccountGroup[] = [
      AccountGroup.COST_OF_GOODS,
      AccountGroup.PERSONNEL,
      AccountGroup.OTHER_OPERATING,
      AccountGroup.FINANCIAL_EXPENSE,
      AccountGroup.TAX,
    ];

    let totalRevenue = 0;
    let totalExpenses = 0;

    const periodEnd = new Date(toStr);
    periodEnd.setHours(23, 59, 59, 999);

    for (const entry of entries) {
      const inPeriod = entry.date >= fromDate && entry.date <= periodEnd;
      if (!inPeriod) continue;

      for (const line of entry.lines) {
        const info = accountInfo.get(line.accountId);
        if (!info) continue;

        const dr = line.debit || 0;
        const cr = line.credit || 0;

        if (pnlRevenueGroups.includes(info.group)) {
          totalRevenue += cr - dr;
        } else if (pnlExpenseGroups.includes(info.group)) {
          totalExpenses += dr - cr;
        }
      }
    }

    const netIncome = r(totalRevenue - totalExpenses);

    // ─── Operating Activities: Changes in Working Capital ─────────
    // Asset increases = cash outflow (negate)
    // Liability increases = cash inflow (keep sign)

    // Receivables (asset): increase = cash outflow
    const changeReceivables = r(
      sumByGroups(endBalances, [AccountGroup.RECEIVABLES]) -
      sumByGroups(beginBalances, [AccountGroup.RECEIVABLES])
    );
    const receivables = r(-changeReceivables);

    // Inventory (asset): increase = cash outflow
    const changeInventory = r(
      sumByGroups(endBalances, [AccountGroup.INVENTORY]) -
      sumByGroups(beginBalances, [AccountGroup.INVENTORY])
    );
    const inventory = r(-changeInventory);

    // Payables (liability): increase = cash inflow
    const changePayables = r(
      sumByGroups(endBalances, [AccountGroup.PAYABLES]) -
      sumByGroups(beginBalances, [AccountGroup.PAYABLES])
    );
    const payables = r(changePayables);

    // Other current assets (asset): increase = cash outflow
    const changeOtherAssets = r(
      sumByGroups(endBalances, [AccountGroup.OTHER_ASSETS]) -
      sumByGroups(beginBalances, [AccountGroup.OTHER_ASSETS])
    );
    const otherCurrentAssets = r(-changeOtherAssets);

    // Other liabilities (liability): increase = cash inflow
    const changeOtherLiabilities = r(
      sumByGroups(endBalances, [AccountGroup.OTHER_LIABILITIES]) -
      sumByGroups(beginBalances, [AccountGroup.OTHER_LIABILITIES])
    );
    const otherLiabilities = r(changeOtherLiabilities);

    // Short-term debt (liability): change = cash inflow when increasing
    const changeShortTermDebt = r(
      sumByGroups(endBalances, [AccountGroup.SHORT_TERM_DEBT]) -
      sumByGroups(beginBalances, [AccountGroup.SHORT_TERM_DEBT])
    );
    const shortTermDebt = r(changeShortTermDebt);

    // VAT accounts (liability/asset): changes affect operating cash flow
    // Output VAT: liability - increase = cash inflow (collected but not remitted)
    // Input VAT: asset (refund claim) - increase = cash outflow
    const changeOutputVAT = r(
      sumByGroups(endBalances, [AccountGroup.OUTPUT_VAT]) -
      sumByGroups(beginBalances, [AccountGroup.OUTPUT_VAT])
    );
    const outputVATChange = r(changeOutputVAT); // liability, positive = inflow

    const changeInputVAT = r(
      sumByGroups(endBalances, [AccountGroup.INPUT_VAT]) -
      sumByGroups(beginBalances, [AccountGroup.INPUT_VAT])
    );
    const inputVATChange = r(-changeInputVAT); // asset, negate for cash flow

    const totalWorkingCapital = r(
      receivables + inventory + payables + otherCurrentAssets + otherLiabilities + shortTermDebt + outputVATChange + inputVATChange
    );
    const cashFromOperations = r(netIncome + totalWorkingCapital);

    // ─── Investing Activities ─────────────────────────────────────
    // Fixed assets (asset): increase = cash outflow
    const changeFixedAssets = r(
      sumByGroups(endBalances, [AccountGroup.FIXED_ASSETS]) -
      sumByGroups(beginBalances, [AccountGroup.FIXED_ASSETS])
    );
    const fixedAssets = r(-changeFixedAssets);
    const cashFromInvesting = r(fixedAssets);

    // ─── Financing Activities ─────────────────────────────────────
    // Long-term debt (liability): increase = cash inflow
    const changeLongTermDebt = r(
      sumByGroups(endBalances, [AccountGroup.LONG_TERM_DEBT]) -
      sumByGroups(beginBalances, [AccountGroup.LONG_TERM_DEBT])
    );
    const longTermDebt = r(changeLongTermDebt);

    // Share capital (equity): increase = cash inflow
    const changeShareCapital = r(
      sumByGroups(endBalances, [AccountGroup.SHARE_CAPITAL]) -
      sumByGroups(beginBalances, [AccountGroup.SHARE_CAPITAL])
    );
    const shareCapital = r(changeShareCapital);

    // Retained earnings (equity) excluding account 3300 (Årets resultat / current year result)
    // 3300 is already captured in netIncome from P&L; other retained earnings changes
    // represent financing items like dividend distributions or prior-year adjustments.
    let beginRetainedExcl3300 = 0;
    let endRetainedExcl3300 = 0;

    for (const [accId, info] of accountInfo) {
      if (info.group === AccountGroup.RETAINED_EARNINGS && info.number !== '3300') {
        beginRetainedExcl3300 += getBalance(beginBalances, accId);
        endRetainedExcl3300 += getBalance(endBalances, accId);
      }
    }

    const changeRetainedExcl3300 = r(endRetainedExcl3300 - beginRetainedExcl3300);
    const retainedEarnings = r(changeRetainedExcl3300);

    const cashFromFinancing = r(longTermDebt + shareCapital + retainedEarnings);

    // ─── Net Change in Cash ───────────────────────────────────────
    const netChangeInCash = r(cashFromOperations + cashFromInvesting + cashFromFinancing);

    // ─── Cash Verification ────────────────────────────────────────
    // Compare computed cash flow against actual change in CASH + BANK balances
    const cashBeginning = r(
      sumByGroups(beginBalances, [AccountGroup.CASH, AccountGroup.BANK])
    );
    const cashEnding = r(
      sumByGroups(endBalances, [AccountGroup.CASH, AccountGroup.BANK])
    );

    const actualCashChange = r(cashEnding - cashBeginning);
    const balanced = Math.abs(netChangeInCash - actualCashChange) < 0.05;

    return NextResponse.json({
      type: 'cash-flow',
      period: { from: fromStr, to: toStr },
      operating: {
        netIncome,
        changesInWorkingCapital: {
          receivables,
          inventory,
          payables,
          otherCurrentAssets,
          otherLiabilities,
          shortTermDebt,
          totalWorkingCapital,
        },
        cashFromOperations,
      },
      investing: {
        fixedAssets,
        cashFromInvesting,
      },
      financing: {
        longTermDebt,
        shareCapital,
        retainedEarnings,
        cashFromFinancing,
      },
      netChangeInCash,
      cashBeginning,
      cashEnding,
      balanced,
    });
  } catch (error) {
    logger.error('Cash flow report error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

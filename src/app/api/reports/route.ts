import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { AccountType, AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, type AuthContext } from '@/lib/rbac';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

/**
 * AccountGroup mappings to report sections
 */
const GROSS_PROFIT_REVENUE_GROUPS: AccountGroup[] = [AccountGroup.SALES_REVENUE, AccountGroup.OTHER_REVENUE];
const COST_OF_GOODS_GROUPS: AccountGroup[] = [AccountGroup.COST_OF_GOODS];
const PERSONNEL_GROUPS: AccountGroup[] = [AccountGroup.PERSONNEL];
const OTHER_OPERATING_GROUPS: AccountGroup[] = [AccountGroup.OTHER_OPERATING];
const FINANCIAL_INCOME_GROUPS: AccountGroup[] = [AccountGroup.FINANCIAL_INCOME];
const FINANCIAL_EXPENSE_GROUPS: AccountGroup[] = [AccountGroup.FINANCIAL_EXPENSE];

const CURRENT_ASSET_GROUPS: AccountGroup[] = [
  AccountGroup.CASH,
  AccountGroup.BANK,
  AccountGroup.RECEIVABLES,
  AccountGroup.INVENTORY,
  AccountGroup.INPUT_VAT,
  AccountGroup.OTHER_ASSETS,
];
const FIXED_ASSET_GROUPS: AccountGroup[] = [AccountGroup.FIXED_ASSETS];
const SHORT_TERM_LIABILITY_GROUPS: AccountGroup[] = [
  AccountGroup.PAYABLES,
  AccountGroup.OUTPUT_VAT,
  AccountGroup.SHORT_TERM_DEBT,
  AccountGroup.OTHER_LIABILITIES,
];
const LONG_TERM_LIABILITY_GROUPS: AccountGroup[] = [AccountGroup.LONG_TERM_DEBT];
const EQUITY_GROUPS: AccountGroup[] = [AccountGroup.SHARE_CAPITAL, AccountGroup.RETAINED_EARNINGS];

// GET - Financial Reports
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');

    if (!type || (!['income-statement', 'balance-sheet'].includes(type))) {
      return NextResponse.json(
        { error: 'Missing or invalid type parameter. Must be "income-statement" or "balance-sheet".' },
        { status: 400 }
      );
    }

    if (!toStr) {
      return NextResponse.json(
        { error: 'Missing required query parameter: to (date in YYYY-MM-DD format)' },
        { status: 400 }
      );
    }

    const toDate = new Date(toStr);
    toDate.setHours(23, 59, 59, 999);

    if (isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid to date format. Use YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    if (type === 'income-statement') {
      return generateIncomeStatement(ctx, fromStr, toStr, toDate);
    } else {
      return generateBalanceSheet(ctx, toStr, toDate);
    }
  } catch (error) {
    logger.error('Reports error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── Income Statement (Resultatopgørelse) ───────────────────────────

async function generateIncomeStatement(
  ctx: AuthContext,
  fromStr: string | null,
  toStr: string,
  toDate: Date
) {
  if (!fromStr) {
    return NextResponse.json(
      { error: 'Missing required query parameter: from (date in YYYY-MM-DD format)' },
      { status: 400 }
    );
  }

  const fromDate = new Date(fromStr);
  if (isNaN(fromDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid from date format. Use YYYY-MM-DD.' },
      { status: 400 }
    );
  }

  // Fetch POSTED, non-cancelled journal entries in the period
    const entries = await db.journalEntry.findMany({
    where: {
      ...tenantFilter(ctx),
      status: 'POSTED',
      cancelled: false,
      date: {
        gte: fromDate,
        lte: toDate,
      },
    },
    include: {
      lines: {
        include: {
          account: true,
        },
      },
    },
  });

  // Group by AccountGroup and sum debits/credits
  const groupMap = new Map<string, { debit: number; credit: number; accounts: Array<{ number: string; name: string; balance: number }> }>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      const group = line.account.group;
      const existing = groupMap.get(group) || { debit: 0, credit: 0, accounts: [] };
      existing.debit += line.debit || 0;
      existing.credit += line.credit || 0;
      groupMap.set(group, existing);
    }
  }

  // Calculate natural balance per group
  // Revenue: credit - debit (normal balance is credit)
  // Expense: debit - credit (normal balance is debit)
  function getGroupBalance(group: string, isRevenue: boolean): number {
    const data = groupMap.get(group);
    if (!data) return 0;
    return r(isRevenue ? data.credit - data.debit : data.debit - data.credit);
  }

  // Gross Profit section
  let revenue = 0;
  for (const g of GROSS_PROFIT_REVENUE_GROUPS) {
    revenue += getGroupBalance(g, true);
  }
  revenue = r(revenue);

  let costOfGoods = 0;
  for (const g of COST_OF_GOODS_GROUPS) {
    costOfGoods += getGroupBalance(g, false);
  }
  costOfGoods = r(costOfGoods);

  const grossProfit = r(revenue - costOfGoods);

  // Operating Expenses
  let personnel = 0;
  for (const g of PERSONNEL_GROUPS) {
    personnel += getGroupBalance(g, false);
  }
  personnel = r(personnel);

  let otherOperating = 0;
  for (const g of OTHER_OPERATING_GROUPS) {
    otherOperating += getGroupBalance(g, false);
  }
  otherOperating = r(otherOperating);

  const totalOperatingExpenses = r(personnel + otherOperating);
  const operatingResult = r(grossProfit - totalOperatingExpenses);

  // Financial Items
  let financialIncome = 0;
  for (const g of FINANCIAL_INCOME_GROUPS) {
    financialIncome += getGroupBalance(g, true);
  }
  financialIncome = r(financialIncome);

  let financialExpenses = 0;
  for (const g of FINANCIAL_EXPENSE_GROUPS) {
    financialExpenses += getGroupBalance(g, false);
  }
  financialExpenses = r(financialExpenses);

  const financialNet = r(financialIncome - financialExpenses);
  const netResult = r(operatingResult + financialNet);

  return NextResponse.json({
    type: 'income-statement',
    period: {
      from: fromStr,
      to: toStr,
    },
    totalRevenue: revenue,
    totalExpenses: r(costOfGoods + totalOperatingExpenses + financialExpenses),
    grossProfit: {
      revenue,
      costOfGoods,
      grossProfit,
    },
    operatingExpenses: {
      personnel,
      otherOperating,
      total: totalOperatingExpenses,
    },
    operatingResult,
    financialItems: {
      financialIncome,
      financialExpenses,
      net: financialNet,
    },
    netResult,
  });
}

// ─── Balance Sheet (Balance) ────────────────────────────────────────

async function generateBalanceSheet(
  ctx: AuthContext,
  toStr: string,
  toDate: Date
) {
  // Fetch ALL POSTED, non-cancelled entries UP TO the to date
  const entries = await db.journalEntry.findMany({
    where: {
      ...tenantFilter(ctx),
      status: 'POSTED',
      cancelled: false,
      date: {
        lte: toDate,
      },
    },
    include: {
      lines: {
        include: {
          account: true,
        },
      },
    },
  });

  // Also fetch all active accounts to ensure we include zero-balance accounts
    const allAccounts = await db.account.findMany({
    where: { ...tenantFilter(ctx), isActive: true },
  });

  // Aggregate per account
  const accountBalances = new Map<string, { number: string; name: string; type: AccountType; group: AccountGroup; debit: number; credit: number }>();

  for (const account of allAccounts) {
    accountBalances.set(account.id, {
      number: account.number,
      name: account.name,
      type: account.type,
      group: account.group,
      debit: 0,
      credit: 0,
    });
  }

  for (const entry of entries) {
    for (const line of entry.lines) {
      const existing = accountBalances.get(line.accountId);
      if (existing) {
        existing.debit += line.debit || 0;
        existing.credit += line.credit || 0;
      } else {
        // Account may have been deactivated but still has entries
        accountBalances.set(line.accountId, {
          number: line.account.number,
          name: line.account.name,
          type: line.account.type,
          group: line.account.group,
          debit: line.debit || 0,
          credit: line.credit || 0,
        });
      }
    }
  }

  // Calculate natural balance for each account
  function getAccountBalance(accountId: string): number {
    const acc = accountBalances.get(accountId);
    if (!acc) return 0;

    if (acc.type === AccountType.ASSET || acc.type === AccountType.EXPENSE) {
      return r(acc.debit - acc.credit);
    } else {
      // LIABILITY, EQUITY, REVENUE
      return r(acc.credit - acc.debit);
    }
  }

  // Helper: sum balances for all accounts matching a group
  function sumByGroups(groups: AccountGroup[]): number {
    let total = 0;
    for (const [accountId, acc] of accountBalances) {
      if (groups.includes(acc.group)) {
        total += getAccountBalance(accountId);
      }
    }
    return r(total);
  }

  // Current Assets breakdown
  const cash = sumByGroups([AccountGroup.CASH]);
  const bank = sumByGroups([AccountGroup.BANK]);
  const receivables = sumByGroups([AccountGroup.RECEIVABLES]);
  const inputVat = sumByGroups([AccountGroup.INPUT_VAT]);
  const inventory = sumByGroups([AccountGroup.INVENTORY]);
  const otherCurrentAssets = sumByGroups([AccountGroup.OTHER_ASSETS]);
  const totalCurrentAssets = r(cash + bank + receivables + inputVat + inventory + otherCurrentAssets);

  // Fixed Assets breakdown
  const machinery = sumByGroups([AccountGroup.FIXED_ASSETS]);
  const totalFixedAssets = machinery;
  const totalAssets = r(totalCurrentAssets + totalFixedAssets);

  // Short-term Liabilities
  const payables = sumByGroups([AccountGroup.PAYABLES]);
  const outputVat = sumByGroups([AccountGroup.OUTPUT_VAT]);
  const shortTermDebt = sumByGroups([AccountGroup.SHORT_TERM_DEBT]);
  const otherLiabilities = sumByGroups([AccountGroup.OTHER_LIABILITIES]);
  const totalShortTerm = r(payables + outputVat + shortTermDebt + otherLiabilities);

  // Long-term Liabilities
  const bankLoan = sumByGroups([AccountGroup.LONG_TERM_DEBT]);
  const totalLongTerm = bankLoan;
  const totalLiabilities = r(totalShortTerm + totalLongTerm);

  // Equity - get individual account balances
  let shareCapital = 0;
  let retainedEarnings = 0;
  let currentYearResult = 0;

  for (const [accountId, acc] of accountBalances) {
    if (acc.group === AccountGroup.SHARE_CAPITAL) {
      shareCapital += getAccountBalance(accountId);
    }
    // RETAINED_EARNINGS includes 3300 (Årets resultat) and 3400 (Overført resultat)
    if (acc.group === AccountGroup.RETAINED_EARNINGS) {
      // Account 3300 = Årets resultat = current year result
      if (acc.number === '3300') {
        currentYearResult = getAccountBalance(accountId);
      } else {
        retainedEarnings += getAccountBalance(accountId);
      }
    }
  }

  // Calculate P&L net income from revenue and expense groups
  // This ensures the balance sheet balances even before year-end closing entries
  const REVENUE_GROUPS: AccountGroup[] = [AccountGroup.SALES_REVENUE, AccountGroup.OTHER_REVENUE, AccountGroup.FINANCIAL_INCOME];
  const EXPENSE_GROUPS: AccountGroup[] = [AccountGroup.COST_OF_GOODS, AccountGroup.PERSONNEL, AccountGroup.OTHER_OPERATING, AccountGroup.FINANCIAL_EXPENSE, AccountGroup.TAX];

  let plNetIncome = 0;
  for (const [, acc] of accountBalances) {
    if (REVENUE_GROUPS.includes(acc.group)) {
      // Revenue: credit - debit (normal balance)
      plNetIncome += r(acc.credit - acc.debit);
    }
    if (EXPENSE_GROUPS.includes(acc.group)) {
      // Expense: debit - credit (natural balance), subtract from income
      plNetIncome -= r(acc.debit - acc.credit);
    }
  }
  plNetIncome = r(plNetIncome);

  // Use P&L net income as current year result if no explicit posting to 3300
  if (currentYearResult === 0) {
    currentYearResult = plNetIncome;
  }

  shareCapital = r(shareCapital);
  retainedEarnings = r(retainedEarnings);
  currentYearResult = r(currentYearResult);
  const totalEquity = r(shareCapital + retainedEarnings + currentYearResult);
  const totalLiabilitiesAndEquity = r(totalLiabilities + totalEquity);

  // Check if balance sheet balances
  const balanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.05;

  return NextResponse.json({
    type: 'balance-sheet',
    asOf: toStr,
    assets: {
      currentAssets: {
        cash,
        bank,
        receivables,
        inputVat,
        inventory,
        otherCurrentAssets,
        total: totalCurrentAssets,
      },
      fixedAssets: {
        total: totalFixedAssets,
      },
      totalAssets,
    },
    liabilities: {
      shortTerm: {
        payables,
        outputVat,
        shortTermDebt,
        otherLiabilities,
        total: totalShortTerm,
      },
      longTerm: {
        bankLoan,
        total: totalLongTerm,
      },
      totalLiabilities,
    },
    equity: {
      shareCapital,
      retainedEarnings,
      currentYearResult,
      totalEquity,
    },
    totalLiabilitiesAndEquity,
    balanced,
  });
}

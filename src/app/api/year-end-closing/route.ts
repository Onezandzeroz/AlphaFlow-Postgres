import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { AccountType, AccountGroup } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// Revenue account groups (balance sheet VAT accounts like OUTPUT_VAT are NOT included — they carry forward)
const REVENUE_GROUPS: AccountGroup[] = [
  AccountGroup.SALES_REVENUE,
  AccountGroup.OTHER_REVENUE,
];

// Expense account groups (balance sheet VAT accounts like INPUT_VAT are NOT included — they carry forward)
const EXPENSE_GROUPS: AccountGroup[] = [
  AccountGroup.COST_OF_GOODS,
  AccountGroup.PERSONNEL,
  AccountGroup.OTHER_OPERATING,
  AccountGroup.FINANCIAL_EXPENSE,
  AccountGroup.TAX,
];

interface AccountBalance {
  id: string;
  number: string;
  name: string;
  type: AccountType;
  group: AccountGroup;
  debit: number;
  credit: number;
  naturalBalance: number;
}

interface ClosingLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  debit: number;
  credit: number;
}

/**
 * GET - Generate a year-end closing preview
 *
 * Returns:
 *   1. Summary of all REVENUE and EXPENSE accounts with their balances
 *   2. Proposed closing journal entry
 *   3. Current fiscal period status for all 12 months
 *   4. Whether the year is ready to close
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    if (!yearParam) {
      return NextResponse.json(
        { error: 'Missing required query parameter: year' },
        { status: 400 }
      );
    }

    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 1900 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid year parameter. Must be a number between 1900 and 2100.' },
        { status: 400 }
      );
    }

    // Date range for the fiscal year
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    // Fetch all posted, non-cancelled journal entries for the year
        const entries = await db.journalEntry.findMany({
      where: {
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        date: {
          gte: yearStart,
          lte: yearEnd,
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

    // Aggregate debits/credits per account (only REVENUE and EXPENSE accounts)
    const accountMap = new Map<string, AccountBalance>();

    // Fetch all active revenue and expense accounts for the user
    const allPandLAccounts = await db.account.findMany({
      where: {
        ...tenantFilter(ctx),
        type: { in: [AccountType.REVENUE, AccountType.EXPENSE] },
      },
    });

    // Initialize all P&L accounts with zero balances
    for (const account of allPandLAccounts) {
      accountMap.set(account.id, {
        id: account.id,
        number: account.number,
        name: account.name,
        type: account.type,
        group: account.group,
        debit: 0,
        credit: 0,
        naturalBalance: 0,
      });
    }

    // Sum up all posted journal entry lines for P&L accounts
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (
          line.account.type === AccountType.REVENUE ||
          line.account.type === AccountType.EXPENSE
        ) {
          const existing = accountMap.get(line.accountId);
          if (existing) {
            existing.debit += line.debit || 0;
            existing.credit += line.credit || 0;
          } else {
            // Account may have been deactivated — still include it
            accountMap.set(line.accountId, {
              id: line.account.id,
              number: line.account.number,
              name: line.account.name,
              type: line.account.type,
              group: line.account.group,
              debit: line.debit || 0,
              credit: line.credit || 0,
              naturalBalance: 0,
            });
          }
        }
      }
    }

    // Calculate natural balance for each account and filter out zero-balance accounts
    const accountSummaries: AccountBalance[] = [];
    for (const [, acc] of accountMap) {
      acc.debit = r(acc.debit);
      acc.credit = r(acc.credit);

      if (acc.type === AccountType.REVENUE) {
        // Revenue: natural balance is credit - debit
        acc.naturalBalance = r(acc.credit - acc.debit);
      } else {
        // Expense: natural balance is debit - credit
        acc.naturalBalance = r(acc.debit - acc.credit);
      }

      if (acc.naturalBalance !== 0) {
        accountSummaries.push(acc);
      }
    }

    // Sort by account number
    accountSummaries.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

    // Build the proposed closing journal entry lines
    const closingLines: ClosingLine[] = [];
    let totalRevenueDebit = 0; // Sum of debits on revenue accounts
    let totalExpenseCredit = 0; // Sum of credits on expense accounts

    for (const acc of accountSummaries) {
      if (acc.type === AccountType.REVENUE && acc.naturalBalance !== 0) {
        // To zero out revenue: DEBIT the account by its credit balance
        const amount = Math.abs(acc.naturalBalance);
        closingLines.push({
          accountId: acc.id,
          accountNumber: acc.number,
          accountName: acc.name,
          accountType: acc.type,
          debit: amount,
          credit: 0,
        });
        totalRevenueDebit += amount;
      } else if (acc.type === AccountType.EXPENSE && acc.naturalBalance !== 0) {
        // To zero out expense: CREDIT the account by its debit balance
        const amount = Math.abs(acc.naturalBalance);
        closingLines.push({
          accountId: acc.id,
          accountNumber: acc.number,
          accountName: acc.name,
          accountType: acc.type,
          debit: 0,
          credit: amount,
        });
        totalExpenseCredit += amount;
      }
    }

    totalRevenueDebit = r(totalRevenueDebit);
    totalExpenseCredit = r(totalExpenseCredit);

    // Find account 3300 (Årets resultat)
    const resultAccount = await db.account.findFirst({
      where: {
        ...tenantFilter(ctx),
        number: '3300',
      },
    });

    // Calculate net result and the balancing entry for 3300
    let resultAccountLine: ClosingLine | null = null;

    if (resultAccount) {
      const netDifference = r(totalRevenueDebit - totalExpenseCredit);

      if (netDifference > 0) {
        // Profit: credit 3300 to balance (more debits on revenue side)
        resultAccountLine = {
          accountId: resultAccount.id,
          accountNumber: resultAccount.number,
          accountName: resultAccount.name,
          accountType: resultAccount.type,
          debit: 0,
          credit: r(netDifference),
        };
      } else if (netDifference < 0) {
        // Loss: debit 3300 to balance (more credits on expense side)
        resultAccountLine = {
          accountId: resultAccount.id,
          accountNumber: resultAccount.number,
          accountName: resultAccount.name,
          accountType: resultAccount.type,
          debit: r(Math.abs(netDifference)),
          credit: 0,
        };
      }
      // If netDifference === 0, no 3300 line needed
    }

    const allClosingLines = resultAccountLine
      ? [...closingLines, resultAccountLine]
      : closingLines;

    const totalDebit = r(allClosingLines.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = r(allClosingLines.reduce((sum, l) => sum + l.credit, 0));
    const netResult = r(totalRevenueDebit - totalExpenseCredit);

    // Fetch fiscal periods for the year
    const fiscalPeriods = await db.fiscalPeriod.findMany({
      where: {
        ...tenantFilter(ctx),
        year,
      },
      orderBy: { month: 'asc' },
    });

    // Check readiness: all 12 periods must exist and be OPEN or already CLOSED
    const allPeriodsExist = fiscalPeriods.length === 12;
    const allPeriodsClosable = fiscalPeriods.every(
      (p) => p.status === 'OPEN' || p.status === 'CLOSED'
    );
    const allPeriodsAlreadyClosed = fiscalPeriods.every(
      (p) => p.status === 'CLOSED'
    );

    const isReadyToClose =
      allPeriodsExist &&
      allPeriodsClosable &&
      !allPeriodsAlreadyClosed &&
      accountSummaries.length > 0;

    const missingMonths = allPeriodsExist
      ? []
      : Array.from({ length: 12 }, (_, i) => i + 1).filter(
          (m) => !fiscalPeriods.some((p) => p.month === m)
        );

    const openPeriods = fiscalPeriods.filter((p) => p.status === 'OPEN');
    const closedPeriods = fiscalPeriods.filter((p) => p.status === 'CLOSED');

    return NextResponse.json({
      year,
      accounts: accountSummaries,
      totalRevenue: r(accountSummaries.filter((a) => a.type === AccountType.REVENUE).reduce((sum, a) => sum + a.naturalBalance, 0)),
      totalExpenses: r(accountSummaries.filter((a) => a.type === AccountType.EXPENSE).reduce((sum, a) => sum + a.naturalBalance, 0)),
      netResult,
      closingEntry: {
        description: `Årsafslutning ${year}`,
        date: `${year}-12-31`,
        lines: allClosingLines,
        totalDebit,
        totalCredit,
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      },
      fiscalPeriods: {
        periods: fiscalPeriods,
        openCount: openPeriods.length,
        closedCount: closedPeriods.length,
        missingMonths,
      },
      resultAccount: resultAccount
        ? {
            id: resultAccount.id,
            number: resultAccount.number,
            name: resultAccount.name,
          }
        : null,
      isReadyToClose,
      warnings: [
        ...(!allPeriodsExist
          ? [`Missing fiscal periods for months: ${missingMonths.join(', ')}`]
          : []),
        ...(!resultAccount
          ? ['Account 3300 (Årets resultat) not found. Please create it before closing.']
          : []),
        ...(allPeriodsAlreadyClosed
          ? [`All fiscal periods for ${year} are already closed.`]
          : []),
        ...(accountSummaries.length === 0
          ? [`No posted revenue or expense entries found for ${year}.`]
          : []),
      ],
    });
  } catch (error) {
    logger.error('Year-end closing preview error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - Execute the year-end closing
 *
 * Steps:
 *   1. Validate year is not in the future
 *   2. Validate confirm is true
 *   3. Create a POSTED journal entry that zeros out all revenue/expense accounts
 *   4. Lock all 12 fiscal periods for the year
 *   5. Log to audit trail
 *   6. Return the created journal entry and locked periods
 */
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
    const { year, confirm } = body;

    if (!year || typeof year !== 'number' || year < 1900 || year > 2100) {
      return NextResponse.json(
        { error: 'A valid year (1900-2100) is required.' },
        { status: 400 }
      );
    }

    // Validate year is not in the future
    const currentYear = new Date().getFullYear();
    if (year > currentYear) {
      return NextResponse.json(
        { error: `Cannot close future year ${year}. Current year is ${currentYear}.` },
        { status: 400 }
      );
    }

    // Validate confirm is true
    if (!confirm || confirm !== true) {
      return NextResponse.json(
        { error: 'Confirmation required. Set confirm: true to execute the year-end closing.' },
        { status: 400 }
      );
    }

    // Check that all 12 fiscal periods exist
        const existingPeriods = await db.fiscalPeriod.findMany({
      where: { ...tenantFilter(ctx), year },
    });

    if (existingPeriods.length !== 12) {
      const missingMonths = Array.from({ length: 12 }, (_, i) => i + 1).filter(
        (m) => !existingPeriods.some((p) => p.month === m)
      );
      return NextResponse.json(
        { error: `Cannot close year: fiscal periods are missing for months: ${missingMonths.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if all periods are already closed
    const allClosed = existingPeriods.every((p) => p.status === 'CLOSED');
    if (allClosed) {
      return NextResponse.json(
        { error: `Year ${year} is already closed. All fiscal periods are locked.` },
        { status: 400 }
      );
    }

    // Date range for the fiscal year
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    // Fetch all posted, non-cancelled journal entries for the year
    const entries = await db.journalEntry.findMany({
      where: {
        ...tenantFilter(ctx),
        status: 'POSTED',
        cancelled: false,
        date: {
          gte: yearStart,
          lte: yearEnd,
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

    // Aggregate debits/credits per P&L account
    const accountMap = new Map<string, { id: string; type: AccountType; debit: number; credit: number }>();

    for (const entry of entries) {
      for (const line of entry.lines) {
        if (
          line.account.type === AccountType.REVENUE ||
          line.account.type === AccountType.EXPENSE
        ) {
          const existing = accountMap.get(line.accountId);
          if (existing) {
            existing.debit += line.debit || 0;
            existing.credit += line.credit || 0;
          } else {
            accountMap.set(line.accountId, {
              id: line.account.id,
              type: line.account.type,
              debit: line.debit || 0,
              credit: line.credit || 0,
            });
          }
        }
      }
    }

    // Build closing journal entry lines
    const closingLinesData: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];
    let totalRevenueDebit = 0;
    let totalExpenseCredit = 0;

    for (const [, acc] of accountMap) {
      if (acc.type === AccountType.REVENUE) {
        // Zero out revenue: DEBIT by credit balance (credit - debit)
        const amount = r(acc.credit - acc.debit);
        if (amount > 0) {
          closingLinesData.push({
            accountId: acc.id,
            debit: amount,
            credit: 0,
            description: `Årsafslutning ${year} - lukning af indtægtskonto`,
          });
          totalRevenueDebit += amount;
        }
      } else if (acc.type === AccountType.EXPENSE) {
        // Zero out expense: CREDIT by debit balance (debit - credit)
        const amount = r(acc.debit - acc.credit);
        if (amount > 0) {
          closingLinesData.push({
            accountId: acc.id,
            debit: 0,
            credit: amount,
            description: `Årsafslutning ${year} - lukning af omkostningskonto`,
          });
          totalExpenseCredit += amount;
        }
      }
    }

    totalRevenueDebit = r(totalRevenueDebit);
    totalExpenseCredit = r(totalExpenseCredit);

    // Find account 3300 (Årets resultat) and add the balancing line
    const resultAccount = await db.account.findFirst({
      where: {
        ...tenantFilter(ctx),
        number: '3300',
      },
    });

    if (!resultAccount) {
      return NextResponse.json(
        { error: 'Account 3300 (Årets resultat) not found. Please create it before closing the year.' },
        { status: 400 }
      );
    }

    const netDifference = r(totalRevenueDebit - totalExpenseCredit);

    if (netDifference > 0) {
      // Profit: credit 3300
      closingLinesData.push({
        accountId: resultAccount.id,
        debit: 0,
        credit: r(netDifference),
        description: `Årsafslutning ${year} - årets resultat (profit)`,
      });
    } else if (netDifference < 0) {
      // Loss: debit 3300
      closingLinesData.push({
        accountId: resultAccount.id,
        debit: r(Math.abs(netDifference)),
        credit: 0,
        description: `Årsafslutning ${year} - årets resultat (tab)`,
      });
    }

    // Validate double-entry balance
    const totalDebit = r(closingLinesData.reduce((sum, l) => sum + l.debit, 0));
    const totalCredit = r(closingLinesData.reduce((sum, l) => sum + l.credit, 0));

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return NextResponse.json(
        { error: `Closing entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}. This should not happen.` },
        { status: 500 }
      );
    }

    if (closingLinesData.length < 2) {
      return NextResponse.json(
        { error: 'No revenue or expense entries to close for this year.' },
        { status: 400 }
      );
    }

    // Create the closing journal entry (POSTED status)
    const closingEntry = await db.journalEntry.create({
      data: {
        date: new Date(year, 11, 31), // December 31
        description: `Årsafslutning ${year}`,
        status: 'POSTED',
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
        lines: {
          create: closingLinesData,
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

    // Lock all 12 fiscal periods for the year
    const now = new Date();
    const lockedPeriods = await db.$transaction(
      existingPeriods.map((period) =>
        db.fiscalPeriod.update({
          where: { id: period.id },
          data: {
            status: 'CLOSED',
            lockedAt: now,
            lockedBy: ctx.id,
          },
        })
      )
    );

    // Audit log
    await auditCreate(
      ctx.id,
      'YearEndClosing',
      closingEntry.id,
      {
        year,
        totalRevenueDebit,
        totalExpenseCredit,
        netResult: netDifference,
        totalDebit,
        totalCredit,
        lineCount: closingLinesData.length,
        periodsLocked: lockedPeriods.length,
      },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json(
      {
        journalEntry: closingEntry,
        lockedPeriods,
        message: `Year ${year} has been successfully closed. ${closingLinesData.length} accounts zeroed, 12 fiscal periods locked.`,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Year-end closing execute error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

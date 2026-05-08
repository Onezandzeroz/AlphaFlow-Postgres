import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { AccountType } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, type AuthContext, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// Month names for budget entry fields
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

type MonthKey = typeof MONTHS[number];

// ─── GET - List budgets or get budget detail with actuals ───────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');

    // If no year, return list of all budgets
    if (!yearParam) {
            const budgets = await db.budget.findMany({
        where: { ...tenantFilter(ctx) },
        orderBy: { year: 'desc', },
        select: {
          id: true,
          name: true,
          year: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return NextResponse.json({ budgets });
    }

    // Parse year
    const year = parseInt(yearParam, 10);
    if (isNaN(year) || year < 2020 || year > 2030) {
      return NextResponse.json(
        { error: 'Invalid year. Must be between 2020 and 2030.' },
        { status: 400 }
      );
    }

    // Find budget for this year
    const budget = await db.budget.findFirst({
      where: { ...tenantFilter(ctx), year },
      include: {
        entries: {
          include: {
            account: true,
          },
        },
      },
    });

    if (!budget) {
      return NextResponse.json({ error: `No budget found for year ${year}` }, { status: 404 });
    }

    // Gather all account IDs from budget entries
    const accountIds = budget.entries.map((e) => e.accountId);

    // Fetch actual posted amounts for each account for each month of the year
    const actualsMap = await computeActualsForAccounts(ctx, accountIds, year);

    // Build entries with budget, actual, variance
    const entries = budget.entries.map((entry) => {
      const actuals = actualsMap.get(entry.accountId) || createEmptyMonthlyAmounts();

      const budgetAmounts: Record<string, number> = {};
      const actualAmounts: Record<string, number> = {};
      const varianceAmounts: Record<string, number> = {};

      let totalBudget = 0;
      let totalActual = 0;

      for (const month of MONTHS) {
        const b = r(entry[month] || 0);
        const a = r(actuals[month] || 0);
        const v = r(a - b);

        budgetAmounts[month] = b;
        actualAmounts[month] = a;
        varianceAmounts[month] = v;

        totalBudget += b;
        totalActual += a;
      }

      return {
        id: entry.id,
        accountId: entry.accountId,
        accountNumber: entry.account.number,
        accountName: entry.account.name,
        accountType: entry.account.type,
        accountGroup: entry.account.group,
        budget: budgetAmounts,
        actual: actualAmounts,
        variance: varianceAmounts,
        totalBudget: r(totalBudget),
        totalActual: r(totalActual),
        totalVariance: r(totalActual - totalBudget),
      };
    });

    // Build summary
    const summary = buildSummary(entries);

    return NextResponse.json({
      budget: {
        id: budget.id,
        name: budget.name,
        year: budget.year,
        notes: budget.notes,
        isActive: budget.isActive,
      },
      entries,
      summary,
    });
  } catch (error) {
    logger.error('Budget GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST - Create a new budget ────────────────────────────────────

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
    const { year, name, notes, entries } = body;

    // Validate required fields
    if (!year || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: year and name' },
        { status: 400 }
      );
    }

    // Validate year range
    if (typeof year !== 'number' || year < 2020 || year > 2030) {
      return NextResponse.json(
        { error: 'Invalid year. Must be between 2020 and 2030.' },
        { status: 400 }
      );
    }

    // Check for duplicate year
        const existingBudget = await db.budget.findFirst({
      where: { ...tenantFilter(ctx), year },
    });

    if (existingBudget) {
      return NextResponse.json(
        { error: `A budget already exists for year ${year}. Use PUT to update it.` },
        { status: 409 }
      );
    }

    // Validate entries if provided
    if (entries && Array.isArray(entries)) {
      const accountIds = entries.map((e: { accountId: string }) => e.accountId);

      // Verify all account IDs exist and belong to the user
      const accounts = await db.account.findMany({
        where: {
          id: { in: accountIds },
          ...tenantFilter(ctx),
        },
      });

      if (accounts.length !== new Set(accountIds).size) {
        const foundIds = new Set(accounts.map((a) => a.id));
        const missingIds = accountIds.filter((id: string) => !foundIds.has(id));
        return NextResponse.json(
          { error: `Invalid account IDs: ${missingIds.join(', ')}` },
          { status: 400 }
        );
      }

      // Check for duplicate account entries
      const seenAccounts = new Set<string>();
      for (const entry of entries) {
        if (seenAccounts.has(entry.accountId)) {
          return NextResponse.json(
            { error: `Duplicate account entry: ${entry.accountId}` },
            { status: 400 }
          );
        }
        seenAccounts.add(entry.accountId);
      }
    }

    // Create budget with entries
    const budget = await db.budget.create({
      data: {
        year,
        name,
        notes: notes || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
        entries: entries && Array.isArray(entries)
          ? {
              create: entries.map((e: Record<string, unknown>) => ({
                accountId: e.accountId as string,
                january: typeof e.january === 'number' ? e.january : 0,
                february: typeof e.february === 'number' ? e.february : 0,
                march: typeof e.march === 'number' ? e.march : 0,
                april: typeof e.april === 'number' ? e.april : 0,
                may: typeof e.may === 'number' ? e.may : 0,
                june: typeof e.june === 'number' ? e.june : 0,
                july: typeof e.july === 'number' ? e.july : 0,
                august: typeof e.august === 'number' ? e.august : 0,
                september: typeof e.september === 'number' ? e.september : 0,
                october: typeof e.october === 'number' ? e.october : 0,
                november: typeof e.november === 'number' ? e.november : 0,
                december: typeof e.december === 'number' ? e.december : 0,
              })),
            }
          : undefined,
      },
      include: { entries: true },
    });

    await auditCreate(
      ctx.id,
      'Budget',
      budget.id,
      { year, name, notes, entryCount: budget.entries.length },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ budget }, { status: 201 });
  } catch (error) {
    logger.error('Budget POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PUT - Update budget ───────────────────────────────────────────

export async function PUT(request: NextRequest) {
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
    const { id, name, notes, isActive, entries } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    // Find existing budget
        const existing = await db.budget.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    const oldData: Record<string, unknown> = {
      name: existing.name,
      notes: existing.notes,
      isActive: existing.isActive,
    };

    if (name !== undefined) updateData.name = name;
    if (notes !== undefined) updateData.notes = notes;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Handle entries (upsert logic)
    if (entries && Array.isArray(entries)) {
      // Validate account IDs exist and belong to user
      const accountIds = entries.map((e: { accountId?: string }) => e.accountId).filter((id): id is string => Boolean(id));
      if (accountIds.length > 0) {
        const accounts = await db.account.findMany({
          where: {
            id: { in: accountIds },
            ...tenantFilter(ctx),
          },
        });

        if (accounts.length !== new Set(accountIds).size) {
          const foundIds = new Set(accounts.map((a) => a.id));
          const missingIds = accountIds.filter((id) => !foundIds.has(id));
          return NextResponse.json(
            { error: `Invalid account IDs: ${missingIds.join(', ')}` },
            { status: 400 }
          );
        }
      }

      // Process entries: update existing or create new
      const existingEntryIds = new Set<string>();
      for (const entry of entries) {
        if (entry.id) {
          existingEntryIds.add(entry.id);
        }
      }

      // Verify existing entry IDs belong to this budget
      const existingEntries = await db.budgetEntry.findMany({
        where: { budgetId: id },
      });
      const existingEntryIdSet = new Set(existingEntries.map((e) => e.id));

      const invalidIds = [...existingEntryIds].filter(
        (eid) => !existingEntryIdSet.has(eid)
      );
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: `Entry IDs do not belong to this budget: ${invalidIds.join(', ')}` },
          { status: 400 }
        );
      }

      // Update or create entries
      for (const entry of entries) {
        const entryData: Record<string, number> = {};
        for (const month of MONTHS) {
          if (typeof entry[month] === 'number') {
            entryData[month] = entry[month];
          }
        }

        if (entry.id) {
          // Update existing entry
          await db.budgetEntry.update({
            where: { id: entry.id },
            data: entryData,
          });
        } else {
          // Create new entry
          await db.budgetEntry.create({
            data: {
              budgetId: id,
              accountId: entry.accountId,
              january: entryData.january || 0,
              february: entryData.february || 0,
              march: entryData.march || 0,
              april: entryData.april || 0,
              may: entryData.may || 0,
              june: entryData.june || 0,
              july: entryData.july || 0,
              august: entryData.august || 0,
              september: entryData.september || 0,
              october: entryData.october || 0,
              november: entryData.november || 0,
              december: entryData.december || 0,
            },
          });
        }
      }
    }

    // Update budget metadata
    const updated = await db.budget.update({
      where: { id },
      data: updateData,
      include: { entries: { include: { account: true } } },
    });

    const newData: Record<string, unknown> = {};
    if (name !== undefined) newData.name = name;
    if (notes !== undefined) newData.notes = notes;
    if (isActive !== undefined) newData.isActive = isActive;
    if (entries) newData.entryCount = entries.length;

    await auditUpdate(
      ctx.id,
      'Budget',
      id,
      oldData,
      newData,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ budget: updated });
  } catch (error) {
    logger.error('Budget PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE - Soft cancel (set isActive = false) ───────────────────

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      // Try body as fallback
      const body = await request.json().catch(() => null);
      const bodyId = body?.id;
      if (!bodyId) {
        return NextResponse.json(
          { error: 'Missing required parameter: id (query param or body)' },
          { status: 400 }
        );
      }
      return await cancelBudget(bodyId, ctx.id, ctx.activeCompanyId, request);
    }

    return await cancelBudget(id, ctx.id, ctx.activeCompanyId, request);
  } catch (error) {
    logger.error('Budget DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── Helper: Cancel a budget ───────────────────────────────────────

async function cancelBudget(
  id: string,
  userId: string,
  companyId: string | null,
  request: NextRequest
) {
    const existing = await db.budget.findFirst({
    where: { id, userId },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Budget not found' }, { status: 404 });
  }

  if (!existing.isActive) {
    return NextResponse.json(
      { error: 'Budget is already cancelled' },
      { status: 400 }
    );
  }

  const cancelled = await db.budget.update({
    where: { id },
    data: { isActive: false },
  });

  await auditCancel(
    userId,
    'Budget',
    id,
    'Budget cancelled via API',
    requestMetadata(request),
    companyId
  );

  return NextResponse.json({ budget: cancelled });
}

// ─── Helper: Compute actual amounts for accounts by month ──────────

async function computeActualsForAccounts(
  ctx: AuthContext,
  accountIds: string[],
  year: number
): Promise<Map<string, Record<MonthKey, number>>> {
  const result = new Map<string, Record<MonthKey, number>>();

  if (accountIds.length === 0) return result;

  // Fetch all POSTED, non-cancelled journal entries for the year
  // where a line references any of the budget accounts
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  // Fetch account types for the natural balance calculation
    const accounts = await db.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, type: true },
  });
  const accountTypeMap = new Map(accounts.map((a) => [a.id, a.type]));

  // Fetch journal entry lines that reference our accounts
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
    include: {
      journalEntry: {
        select: { date: true },
      },
    },
  });

  // Initialize result map with empty monthly amounts
  for (const accountId of accountIds) {
    result.set(accountId, createEmptyMonthlyAmounts());
  }

  // Aggregate actual amounts by account and month
  for (const line of lines) {
    const monthIndex = line.journalEntry.date.getMonth(); // 0-11
    const monthKey = MONTHS[monthIndex];
    const accountType = accountTypeMap.get(line.accountId);

    const current = result.get(line.accountId);
    if (!current) continue;

    // Compute actual based on account type
    let actual = 0;
    if (accountType === AccountType.REVENUE) {
      // Revenue: credit - debit (credit increases revenue)
      actual = (line.credit || 0) - (line.debit || 0);
    } else if (accountType === AccountType.EXPENSE) {
      // Expense: debit - credit (debit increases expense)
      actual = (line.debit || 0) - (line.credit || 0);
    } else if (accountType === AccountType.ASSET) {
      // Asset: debit - credit (debit increases assets)
      actual = (line.debit || 0) - (line.credit || 0);
    } else if (accountType === AccountType.LIABILITY) {
      // Liability: credit - debit (credit increases liabilities)
      actual = (line.credit || 0) - (line.debit || 0);
    } else if (accountType === AccountType.EQUITY) {
      // Equity: credit - debit (credit increases equity)
      actual = (line.credit || 0) - (line.debit || 0);
    }

    current[monthKey] = r((current[monthKey] || 0) + actual);
  }

  return result;
}

// ─── Helper: Create empty monthly amounts object ───────────────────

function createEmptyMonthlyAmounts(): Record<MonthKey, number> {
  const amounts: Record<string, number> = {};
  for (const month of MONTHS) {
    amounts[month] = 0;
  }
  return amounts as Record<MonthKey, number>;
}

// ─── Helper: Build summary from entries ────────────────────────────

function buildSummary(
  entries: Array<{
    accountType: string;
    totalBudget: number;
    totalActual: number;
    totalVariance: number;
  }>
) {
  let totalBudget = 0;
  let totalActual = 0;

  const byType: Record<string, { budget: number; actual: number; variance: number }> = {
    REVENUE: { budget: 0, actual: 0, variance: 0 },
    EXPENSE: { budget: 0, actual: 0, variance: 0 },
    ASSET: { budget: 0, actual: 0, variance: 0 },
    LIABILITY: { budget: 0, actual: 0, variance: 0 },
    EQUITY: { budget: 0, actual: 0, variance: 0 },
  };

  for (const entry of entries) {
    totalBudget += entry.totalBudget;
    totalActual += entry.totalActual;

    if (byType[entry.accountType]) {
      byType[entry.accountType].budget += entry.totalBudget;
      byType[entry.accountType].actual += entry.totalActual;
      byType[entry.accountType].variance += entry.totalVariance;
    }
  }

  // Round summary values
  totalBudget = r(totalBudget);
  totalActual = r(totalActual);

  for (const type of Object.keys(byType)) {
    byType[type].budget = r(byType[type].budget);
    byType[type].actual = r(byType[type].actual);
    byType[type].variance = r(byType[type].variance);
  }

  return {
    totalBudget,
    totalActual,
    totalVariance: r(totalActual - totalBudget),
    byType,
  };
}

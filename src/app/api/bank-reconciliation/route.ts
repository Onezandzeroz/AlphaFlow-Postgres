import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, tenantFilter, Permission, companyScope, type AuthContext, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { auditCreate, auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getDemoFilterFromContext } from '@/lib/demo-filter';

// Helper to round to 2 decimals
const r = (n: number) => Math.round(n * 100) / 100;

// GET candidates for manual matching
async function getCandidates(request: NextRequest, ctx: AuthContext) {
  const { searchParams } = new URL(request.url);
  const bankLineId = searchParams.get('bankLineId');

  if (!bankLineId) {
    return NextResponse.json({ error: 'Missing bankLineId parameter' }, { status: 400 });
  }

  // Fetch the bank statement line
  const bankLine = await db.bankStatementLine.findUnique({
    where: { id: bankLineId },
    include: { bankStatement: true },
  });

  const scope = companyScope(ctx);
  if (!bankLine || (scope.companyId && bankLine.bankStatement.companyId !== scope.companyId)) {
    return NextResponse.json({ error: 'Bank statement line not found' }, { status: 404 });
  }

  // Find bank accounts (filtered by tenant)
  const bankAccounts = await db.account.findMany({
    where: {
      ...tenantFilter(ctx),
      group: 'BANK',
      isActive: true,
    },
  });

  const bankAccountIds = bankAccounts.map((a) => a.id);
  if (bankAccountIds.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  // Fetch unmatched journal entry lines on bank accounts within ±7 days
  const lineDate = new Date(bankLine.date);
  const searchStart = new Date(lineDate);
  searchStart.setDate(searchStart.getDate() - 7);
  const searchEnd = new Date(lineDate);
  searchEnd.setDate(searchEnd.getDate() + 7);

  const journalLines = await db.journalEntryLine.findMany({
    where: {
      accountId: { in: bankAccountIds },
      journalEntry: {
        ...companyScope(ctx),
        status: 'POSTED',
        cancelled: false,
        date: { gte: searchStart, lte: searchEnd },
      },
      bankMatches: { none: {} }, // Not already matched
    },
    include: {
      account: true,
      journalEntry: true,
    },
    orderBy: { journalEntry: { date: 'asc' } },
  });

  const candidates = journalLines
    .map((jl) => ({
      id: jl.id,
      date: jl.journalEntry.date.toISOString().split('T')[0],
      description: jl.journalEntry.description || jl.journalEntry.reference || '',
      accountNumber: jl.account.number,
      accountName: jl.account.name,
      debit: r(jl.debit || 0),
      credit: r(jl.credit || 0),
      amount: r(jl.debit > 0 ? -jl.debit : jl.credit), // Bank perspective
    }))
    .filter((c) => Math.abs(c.amount - bankLine.amount) < 1.0); // Within 1 DKK tolerance

  return NextResponse.json({ candidates });
}

// Run AI-assisted matching on all unmatched lines
async function runAiMatch(request: NextRequest, ctx: AuthContext) {
  try {
    const { searchParams } = new URL(request.url);
    const statementId = searchParams.get('statementId');

    // Find unmatched bank statement lines
    const lineWhere: Record<string, unknown> = {
      reconciliationStatus: 'UNMATCHED',
      bankStatement: { ...tenantFilter(ctx) },
    };

    if (statementId) {
      lineWhere.bankStatementId = statementId;
    }

    const unmatchedLines = await db.bankStatementLine.findMany({
      where: lineWhere,
      include: { bankStatement: true },
      take: 50,
    });

    if (unmatchedLines.length === 0) {
      return NextResponse.json({ matches: [], message: 'Ingen uafstemte linjer' });
    }

    // Get bank accounts
    const bankAccounts = await db.account.findMany({
      where: { ...tenantFilter(ctx), group: 'BANK', isActive: true },
    });

    if (bankAccounts.length === 0) {
      return NextResponse.json({ matches: [], message: 'Ingen bankkonti fundet' });
    }

    // Get journal lines for matching
    const bankAccountIds = bankAccounts.map(a => a.id);
    const journalLines = await db.journalEntryLine.findMany({
      where: {
        accountId: { in: bankAccountIds },
        journalEntry: { ...companyScope(ctx), status: 'POSTED', cancelled: false },
        bankMatches: { none: {} },
      },
      include: { account: true, journalEntry: true },
    });

    if (journalLines.length === 0) {
      return NextResponse.json({ matches: [], message: 'Ingen journalposter at matche mod' });
    }

    // Use matching engine
    const { batchMatch, aiBatchMatch } = await import('@/lib/matching-engine');

    const bankLineInputs = unmatchedLines.map(l => ({
      id: l.id,
      date: new Date(l.date),
      description: l.description,
      reference: l.reference,
      amount: l.amount,
    }));

    const journalLineInputs = journalLines.map(jl => ({
      id: jl.id,
      date: new Date(jl.journalEntry.date),
      description: jl.journalEntry.description || '',
      accountNumber: jl.account.number,
      accountName: jl.account.name,
      amount: jl.debit > 0 ? -jl.debit : jl.credit,
    }));

    // First run rule-based + fuzzy matching
    const ruleMatches = batchMatch(bankLineInputs, journalLineInputs, {
      autoMatchThreshold: 0.95,
    });

    // Then run AI matching on remaining unmatched lines
    const aiCandidates = bankLineInputs.filter(bl => !ruleMatches.has(bl.id));
    const aiMatches = await aiBatchMatch(aiCandidates, journalLineInputs, {
      aiConfidenceThreshold: 0.80,
    });

    // Combine results
    const allMatches = new Map([...ruleMatches, ...aiMatches]);

    // Apply matches
    let autoMatched = 0;
    let suggested = 0;

    for (const [bankLineId, match] of allMatches) {
      const status = match.confidence >= 0.95 ? 'MATCHED' : 'AI_SUGGESTED';
      await db.bankStatementLine.update({
        where: { id: bankLineId },
        data: {
          reconciliationStatus: status,
          matchedJournalLineId: match.journalLineId,
          matchedAt: new Date(),
          matchConfidence: match.confidence,
          matchMethod: match.method,
        },
      });

      if (status === 'MATCHED') {
        autoMatched++;
      } else {
        suggested++;
      }
    }

    // Check statement reconciliation status
    const statementIds = [...new Set(unmatchedLines.map(l => l.bankStatementId))];
    for (const stmtId of statementIds) {
      const unmatchedCount = await db.bankStatementLine.count({
        where: {
          bankStatementId: stmtId,
          reconciliationStatus: { in: ['UNMATCHED'] },
        },
      });
      if (unmatchedCount === 0) {
        await db.bankStatement.update({
          where: { id: stmtId },
          data: { reconciled: true, reconciledAt: new Date() },
        });
      }
    }

    return NextResponse.json({
      matches: Array.from(allMatches.entries()).map(([id, m]) => ({
        bankLineId: id,
        ...m,
      })),
      summary: {
        totalUnmatched: unmatchedLines.length,
        autoMatched,
        suggested,
        remaining: unmatchedLines.length - autoMatched - suggested,
      },
    });
  } catch (error) {
    logger.error('AI match error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET - List bank statements or get matching candidates
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const forbidden = requirePermission(ctx, Permission.DATA_READ);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Handle candidates action for manual matching
    if (action === 'candidates') {
      return getCandidates(request, ctx);
    }

    // Handle AI match action
    if (action === 'ai-match') {
      return runAiMatch(request, ctx);
    }

    const statusFilter = searchParams.get('status') || 'all';

    const where: Record<string, unknown> = { ...tenantFilter(ctx) };

    if (statusFilter === 'unmatched') {
      where.lines = {
        some: { reconciliationStatus: 'UNMATCHED' },
      };
    } else if (statusFilter === 'matched') {
      where.reconciled = true;
    }

    const statements = await db.bankStatement.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        lines: {
          include: {
            matchedJournalLine: {
              include: {
                account: true,
                journalEntry: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    return NextResponse.json({ bankStatements: statements });
  } catch (error) {
    logger.error('List bank statements error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Import a bank statement
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
    const { bankAccount, lines, fileName, importSource, bankConnectionId } = body;

    if (!bankAccount || !lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: bankAccount and lines array' },
        { status: 400 }
      );
    }

    // Validate each line
    for (const line of lines) {
      if (!line.date || !line.description || typeof line.amount !== 'number' || typeof line.balance !== 'number') {
        return NextResponse.json(
          { error: 'Each line must have date (string), description (string), amount (number), and balance (number)' },
          { status: 400 }
        );
      }
    }

    // Sort lines by date
    const sortedLines = [...lines].sort((a: { date: string }, b: { date: string }) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const startDate = new Date(sortedLines[0].date);
    const endDate = new Date(sortedLines[sortedLines.length - 1].date);
    const openingBalance = sortedLines[0].balance - sortedLines[0].amount;
    const closingBalance = sortedLines[sortedLines.length - 1].balance;

    // Fetch journal entry lines for the bank account for auto-matching
    const bankDemoFilter = getDemoFilterFromContext(ctx);
    // Find the bank account by account group BANK or by account number matching the bankAccount identifier
    const bankAccounts = await db.account.findMany({
      where: {
        ...tenantFilter(ctx),
        group: 'BANK',
        isActive: true,
        ...bankDemoFilter,
      },
    });

    // Also try to match by account number if provided
    const matchedBankAccount = bankAccounts.find(
      (a) => a.number === bankAccount || a.name.toLowerCase().includes(bankAccount.toLowerCase())
    );

    // Fetch all journal entry lines on bank accounts for the statement period
    const statementStart = new Date(startDate);
    statementStart.setDate(statementStart.getDate() - 3); // -3 days for matching window
    const statementEnd = new Date(endDate);
    statementEnd.setDate(statementEnd.getDate() + 3); // +3 days for matching window

    const bankAccountIds = bankAccounts.map((a) => a.id);
    const journalLines = bankAccountIds.length > 0
      ? await db.journalEntryLine.findMany({
          where: {
            accountId: { in: bankAccountIds },
            journalEntry: {
              ...tenantFilter(ctx),
              status: 'POSTED',
              cancelled: false,
              date: {
                gte: statementStart,
                lte: statementEnd,
              },
            },
          },
          include: {
            account: true,
            journalEntry: true,
          },
        })
      : [];

    // Create the bank statement with lines
    const statement = await db.bankStatement.create({
      data: {
        bankAccount,
        startDate,
        endDate,
        openingBalance: Math.round(openingBalance * 100) / 100,
        closingBalance: Math.round(closingBalance * 100) / 100,
        fileName: fileName || null,
        importSource: importSource || 'csv',
        bankConnectionId: bankConnectionId || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
        lines: {
          create: sortedLines.map((line: { date: string; description: string; reference?: string; amount: number; balance: number }) => ({
            date: new Date(line.date),
            description: line.description,
            reference: line.reference || null,
            amount: Math.round(line.amount * 100) / 100,
            balance: Math.round(line.balance * 100) / 100,
            reconciliationStatus: 'UNMATCHED',
          })),
        },
      },
      include: {
        lines: true,
      },
    });

    // Auto-match: match by exact amount ±0.01, within date range ±3 days
    let matchedCount = 0;
    const usedJournalLineIds = new Set<string>();

    for (const bankLine of statement.lines) {
      const bankLineDate = new Date(bankLine.date);
      let bestMatchId: string | null = null;

      for (const jl of journalLines) {
        // Skip already matched journal lines
        if (usedJournalLineIds.has(jl.id)) continue;

        const jlDate = new Date(jl.journalEntry.date);
        const daysDiff = Math.abs(bankLineDate.getTime() - jlDate.getTime()) / (1000 * 60 * 60 * 24);

        // Check date window ±3 days
        if (daysDiff > 3) continue;

        // Check amount match ±0.01
        // Journal line can be debit (money out of bank) or credit (money into bank)
        // Bank statement amount: positive = money in, negative = money out
        const journalAmount = jl.debit > 0 ? -jl.debit : jl.credit; // debit = out of bank, credit = into bank
        const amountDiff = Math.abs(bankLine.amount - journalAmount);

        if (amountDiff <= 0.01) {
          bestMatchId = jl.id;
          break;
        }
      }

      if (bestMatchId) {
        usedJournalLineIds.add(bestMatchId);
        await db.bankStatementLine.update({
          where: { id: bankLine.id },
          data: {
            reconciliationStatus: 'MATCHED',
            matchedJournalLineId: bestMatchId,
            matchedAt: new Date(),
          },
        });
        matchedCount++;
      }
    }

    // Update statement reconciled status if all lines are matched
    const unmatchedCount = await db.bankStatementLine.count({
      where: {
        bankStatementId: statement.id,
        reconciliationStatus: 'UNMATCHED',
      },
    });

    if (unmatchedCount === 0 && statement.lines.length > 0) {
      await db.bankStatement.update({
        where: { id: statement.id },
        data: {
          reconciled: true,
          reconciledAt: new Date(),
        },
      });
    }

    // Re-fetch with relations for response
    const updatedStatement = await db.bankStatement.findUnique({
      where: { id: statement.id },
      include: {
        lines: {
          include: {
            matchedJournalLine: {
              include: {
                account: true,
                journalEntry: true,
              },
            },
          },
          orderBy: { date: 'asc' },
        },
      },
    });

    await auditCreate(
      ctx.id,
      'BankStatement',
      statement.id,
      {
        bankAccount,
        lineCount: lines.length,
        matchedCount,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json(
      {
        bankStatement: updatedStatement,
        autoMatchResults: {
          totalLines: lines.length,
          matched: matchedCount,
          unmatched: lines.length - matchedCount,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Import bank statement error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Manual match/unmatch
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
    const { bankLineId, journalLineId, action } = body;

    if (!bankLineId || !action || !['match', 'unmatch'].includes(action)) {
      return NextResponse.json(
        { error: 'Missing required fields: bankLineId and action ("match" or "unmatch")' },
        { status: 400 }
      );
    }

    if (action === 'match' && !journalLineId) {
      return NextResponse.json(
        { error: 'journalLineId is required for match action' },
        { status: 400 }
      );
    }

    // Find the bank statement line and verify ownership
    const bankLine = await db.bankStatementLine.findUnique({
      where: { id: bankLineId },
      include: {
        bankStatement: true,
      },
    });

    if (!bankLine || bankLine.bankStatement.userId !== ctx.id) {
      return NextResponse.json(
        { error: 'Bank statement line not found' },
        { status: 404 }
      );
    }

    if (action === 'match') {
      // Verify the journal line exists and belongs to the user
      const journalLine = await db.journalEntryLine.findUnique({
        where: { id: journalLineId },
        include: {
          journalEntry: true,
        },
      });

      if (!journalLine || journalLine.journalEntry.userId !== ctx.id) {
        return NextResponse.json(
          { error: 'Journal entry line not found' },
          { status: 404 }
        );
      }

      const oldData = {
        reconciliationStatus: bankLine.reconciliationStatus,
        matchedJournalLineId: bankLine.matchedJournalLineId,
      };

      const updatedLine = await db.bankStatementLine.update({
        where: { id: bankLineId },
        data: {
          reconciliationStatus: 'MANUAL',
          matchedJournalLineId: journalLineId,
          matchedAt: new Date(),
          matchMethod: 'manual',
          matchConfidence: 1.0,
        },
        include: {
          matchedJournalLine: {
            include: {
              account: true,
              journalEntry: true,
            },
          },
        },
      });

      await auditUpdate(
        ctx.id,
        'BankStatement',
        bankLine.bankStatementId,
        oldData,
        {
          reconciliationStatus: 'MANUAL',
          matchedJournalLineId: journalLineId,
        },
        { ...requestMetadata(request), bankLineId, journalLineId, action },
        ctx.activeCompanyId
      );

      // Check if all lines of the statement are now matched
      const unmatchedCount = await db.bankStatementLine.count({
        where: {
          bankStatementId: bankLine.bankStatementId,
          reconciliationStatus: 'UNMATCHED',
        },
      });

      if (unmatchedCount === 0) {
        await db.bankStatement.update({
          where: { id: bankLine.bankStatementId },
          data: {
            reconciled: true,
            reconciledAt: new Date(),
          },
        });
      }

      return NextResponse.json({ bankStatementLine: updatedLine });
    } else {
      // Unmatch
      const oldData = {
        reconciliationStatus: bankLine.reconciliationStatus,
        matchedJournalLineId: bankLine.matchedJournalLineId,
      };

      const updatedLine = await db.bankStatementLine.update({
        where: { id: bankLineId },
        data: {
          reconciliationStatus: 'UNMATCHED',
          matchedJournalLineId: null,
          matchedAt: null,
        },
        include: {
          matchedJournalLine: {
            include: {
              account: true,
              journalEntry: true,
            },
          },
        },
      });

      // If the statement was fully reconciled, mark it as unreconciled
      if (bankLine.bankStatement.reconciled) {
        await db.bankStatement.update({
          where: { id: bankLine.bankStatementId },
          data: {
            reconciled: false,
            reconciledAt: null,
          },
        });
      }

      await auditUpdate(
        ctx.id,
        'BankStatement',
        bankLine.bankStatementId,
        oldData,
        {
          reconciliationStatus: 'UNMATCHED',
          matchedJournalLineId: null,
        },
        { ...requestMetadata(request), bankLineId, action },
        ctx.activeCompanyId
      );

      return NextResponse.json({ bankStatementLine: updatedLine });
    }
  } catch (error) {
    logger.error('Bank reconciliation match error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

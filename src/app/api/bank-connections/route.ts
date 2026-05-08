import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { getProvider, getAvailableBanks } from '@/lib/bank-providers';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { getDemoFilter } from '@/lib/demo-filter';

// GET - List bank connections or available banks
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // List available banks
    if (action === 'banks') {
      return NextResponse.json({ banks: getAvailableBanks() });
    }

    // List user's bank connections
    
    const connections = await db.bankConnection.findMany({
      where: {
        ...tenantFilter(ctx),
      },
      include: {
        syncs: {
          orderBy: { startedAt: 'desc' },
          take: 3,
        },
        bankStatements: {
          orderBy: { startDate: 'desc' },
          take: 1,
          include: {
            lines: {
              where: { reconciliationStatus: 'UNMATCHED' },
              take: 0,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Add computed fields
    const enriched = connections.map(conn => ({
      ...conn,
      unmatchedCount: conn.bankStatements.reduce(
        (sum, stmt) => sum + (stmt as any).lines?.length || 0,
        0
      ),
      recentSyncs: conn.syncs,
    }));

    return NextResponse.json({ connections: enriched });
  } catch (error) {
    logger.error('List bank connections error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new bank connection
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
    const {
      bankName,
      provider,
      registrationNumber,
      accountNumber,
      iban,
      accountName,
      syncFrequency = 'daily',
    } = body;

    if (!bankName || !provider || !accountNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: bankName, provider, accountNumber' },
        { status: 400 }
      );
    }

    
    // Check for duplicate account
    const existing = await db.bankConnection.findFirst({
      where: {
        ...tenantFilter(ctx),
        accountNumber,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'En bankforbindelse med dette kontonummer findes allerede' },
        { status: 409 }
      );
    }

    // Get the provider
    const bankProvider = getProvider(provider);
    if (!bankProvider) {
      return NextResponse.json(
        { error: `Ukendt bankudbyder: ${provider}` },
        { status: 400 }
      );
    }

    // Initiate consent
    const consentResult = await bankProvider.initiateConsent({
      registrationNumber: registrationNumber || '',
      accountNumber,
      iban,
    });

    // Calculate next sync time
    const now = new Date();
    const nextSyncAt = new Date(now);
    if (syncFrequency === 'hourly') {
      nextSyncAt.setHours(nextSyncAt.getHours() + 1);
    } else if (syncFrequency === 'daily') {
      nextSyncAt.setDate(nextSyncAt.getDate() + 1);
      nextSyncAt.setHours(6, 0, 0, 0); // 6 AM next day
    }
    // manual = no auto sync

    // Simple encoding for tokens (in production: AES-256 encryption)
    const encodeToken = (token: string) => Buffer.from(token).toString('base64');

    // For real banks with pending consent, don't schedule auto-sync until authorized
    const isActiveConsent = consentResult.status === 'active';
    const effectiveNextSyncAt = isActiveConsent && syncFrequency !== 'manual' ? nextSyncAt : null;

    const connection = await db.bankConnection.create({
      data: {
        bankName,
        provider,
        registrationNumber: registrationNumber || null,
        accountNumber,
        iban: iban || null,
        accountName: accountName || null,
        syncFrequency,
        status: isActiveConsent ? 'ACTIVE' : 'PENDING',
        consentId: consentResult.consentId,
        consentExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days default
        accessToken: consentResult.consentId ? encodeToken(consentResult.consentId) : null,
        nextSyncAt: effectiveNextSyncAt,
        isDemo: bankProvider.isDemo ? ctx.isDemoCompany : false,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
      },
    });

    await auditCreate(
      ctx.id,
      'BankConnection',
      connection.id,
      {
        bankName,
        provider,
        accountNumber,
        status: connection.status,
      },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    // If demo provider and active, do an initial sync
    if (bankProvider.isDemo && connection.status === 'ACTIVE') {
      const syncResult = await performSync(connection.id, ctx.id, ctx.isDemoCompany);
      return NextResponse.json(
        { connection, initialSync: syncResult },
        { status: 201 }
      );
    }

    // For real banks: return the consent redirect URL
    // Include connection_id in the redirect so the callback can update the connection
    let consentRedirect = consentResult.redirectUrl || null;
    if (consentRedirect && !consentRedirect.includes('connection_id')) {
      const separator = consentRedirect.includes('?') ? '&' : '?';
      consentRedirect = `${consentRedirect}${separator}connection_id=${connection.id}`;
    }

    return NextResponse.json(
      {
        connection,
        consentRedirect,
        sandboxMode: consentResult.sandboxMode || false,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('Create bank connection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper: Perform sync for a bank connection
async function performSync(connectionId: string, userId: string, isDemo: boolean) {
  const connection = await db.bankConnection.findUnique({
    where: { id: connectionId },
  });

  if (!connection || connection.userId !== userId) {
    return null;
  }

  // Don't sync connections that haven't been authorized yet
  if (connection.status !== 'ACTIVE') {
    return { error: 'Bank connection requires authorization before syncing. Complete the consent flow first.' };
  }

  const provider = getProvider(connection.provider);
  if (!provider) return null;

  // Create sync record
  const sync = await db.bankConnectionSync.create({
    data: {
      bankConnectionId: connectionId,
      status: 'PENDING',
    },
  });

  try {
    // Decode token (in production: AES-256 decryption)
    const decodeToken = (encoded: string | null) =>
      encoded ? Buffer.from(encoded, 'base64').toString() : '';

    const fromDate = connection.lastSyncAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = new Date();

    const result = await provider.fetchTransactions({
      accessToken: decodeToken(connection.accessToken),
      accountNumber: connection.accountNumber,
      fromDate,
      toDate,
    });

    // Deduplicate against existing transactions
    const existingLines = await db.bankStatementLine.findMany({
      where: {
        bankStatement: {
          companyId: connection.companyId,
          bankConnectionId: connectionId,
        },
      },
      select: { date: true, amount: true, description: true },
    });

    const existingKeys = new Set(
      existingLines.map(l =>
        `${l.date.toISOString().split('T')[0]}_${l.amount.toFixed(2)}_${l.description.substring(0, 30)}`
      )
    );

    const newTransactions = result.transactions.filter(tx => {
      const key = `${tx.date}_${tx.amount.toFixed(2)}_${tx.description.substring(0, 30)}`;
      return !existingKeys.has(key);
    });

    // Create bank statement if there are new transactions
    let matchedCount = 0;
    if (newTransactions.length > 0) {
      const sortedTx = [...newTransactions].sort((a, b) => a.date.localeCompare(b.date));
      const openingBalance = sortedTx[0].balance - sortedTx[0].amount;
      const closingBalance = sortedTx[sortedTx.length - 1].balance;

      
      const statement = await db.bankStatement.create({
        data: {
          bankAccount: `${connection.registrationNumber || ''}${connection.accountNumber}`,
          startDate: new Date(sortedTx[0].date),
          endDate: new Date(sortedTx[sortedTx.length - 1].date),
          openingBalance: Math.round(openingBalance * 100) / 100,
          closingBalance: Math.round(closingBalance * 100) / 100,
          importSource: 'open_banking',
          importDate: new Date(),
          bankConnectionId: connectionId,
          companyId: connection.companyId,
          isDemo,
          userId,
          lines: {
            create: sortedTx.map(tx => ({
              date: new Date(tx.date),
              description: tx.description,
              reference: tx.reference || null,
              amount: Math.round(tx.amount * 100) / 100,
              balance: Math.round(tx.balance * 100) / 100,
              reconciliationStatus: 'UNMATCHED',
            })),
          },
        },
        include: { lines: true },
      });

      // Auto-match using the matching engine
      const { batchMatch } = await import('@/lib/matching-engine');
      const bankDemoFilter = { isDemo };

      const bankAccounts = await db.account.findMany({
        where: {
          companyId: connection.companyId,
          ...bankDemoFilter,
          group: 'BANK',
          isActive: true,
        },
      });

      if (bankAccounts.length > 0) {
        const bankAccountIds = bankAccounts.map(a => a.id);

        const journalLines = await db.journalEntryLine.findMany({
          where: {
            accountId: { in: bankAccountIds },
            journalEntry: {
              companyId: connection.companyId,
              ...bankDemoFilter,
              status: 'POSTED',
              cancelled: false,
            },
          },
          include: {
            account: true,
            journalEntry: true,
          },
        });

        const bankLineInputs = statement.lines.map(l => ({
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

        const matches = batchMatch(bankLineInputs, journalLineInputs, {
          autoMatchThreshold: 0.95,
        });

        // Apply matches
        for (const [bankLineId, match] of matches) {
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
          matchedCount++;
        }

        // Check if all lines matched
        const unmatchedCount = await db.bankStatementLine.count({
          where: {
            bankStatementId: statement.id,
            reconciliationStatus: 'UNMATCHED',
          },
        });

        if (unmatchedCount === 0) {
          await db.bankStatement.update({
            where: { id: statement.id },
            data: { reconciled: true, reconciledAt: new Date() },
          });
        }
      }
    }

    // Update sync record
    await db.bankConnectionSync.update({
      where: { id: sync.id },
      data: {
        status: 'SUCCESS',
        completedAt: new Date(),
        transactionsFound: result.transactions.length,
        transactionsNew: newTransactions.length,
        transactionsDup: result.transactions.length - newTransactions.length,
        matchedCount,
      },
    });

    // Update connection
    const nextSync = new Date();
    if (connection.syncFrequency === 'hourly') {
      nextSync.setHours(nextSync.getHours() + 1);
    } else if (connection.syncFrequency === 'daily') {
      nextSync.setDate(nextSync.getDate() + 1);
      nextSync.setHours(6, 0, 0, 0);
    }

    const lastBalance = newTransactions.length > 0
      ? newTransactions[newTransactions.length - 1].balance
      : connection.currentBalance;

    await db.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: 'ACTIVE',
        lastSyncAt: new Date(),
        nextSyncAt: connection.syncFrequency !== 'manual' ? nextSync : null,
        currentBalance: lastBalance,
        retryCount: 0,
        lastError: null,
      },
    });

    return {
      transactionsFound: result.transactions.length,
      transactionsNew: newTransactions.length,
      matchedCount,
    };
  } catch (error) {
    logger.error('Bank connection sync error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await db.bankConnectionSync.update({
      where: { id: sync.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        errorMessage,
        errorCode: 'SYNC_ERROR',
      },
    });

    // Update connection retry count
    await db.bankConnection.update({
      where: { id: connectionId },
      data: {
        retryCount: { increment: 1 },
        lastError: errorMessage,
        status: connection.retryCount >= 3 ? 'ERROR' : connection.status,
      },
    });

    return { error: errorMessage };
  }
}

// Export for use in sync route
export { performSync };

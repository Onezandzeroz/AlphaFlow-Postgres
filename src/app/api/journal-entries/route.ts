import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { JournalEntryStatus, VATCode } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { ensureInitialBackup } from '@/lib/backup-scheduler';

// GET - List journal entries for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    const accountFilter = searchParams.get('account');

        const where: Record<string, unknown> = { ...tenantFilter(ctx) };

    if (statusFilter && Object.values(JournalEntryStatus).includes(statusFilter as JournalEntryStatus)) {
      where.status = statusFilter;
    }

    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) {
        (where.date as Record<string, unknown>).gte = new Date(fromDate);
      }
      if (toDate) {
        // Include the entire end date by setting to end of day
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        (where.date as Record<string, unknown>).lte = end;
      }
    }

    if (accountFilter) {
      where.lines = {
        some: { accountId: accountFilter },
      };
    }

    const entries = await db.journalEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return NextResponse.json({ journalEntries: entries });
  } catch (error) {
    logger.error('List journal entries error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Create a new journal entry with multiple lines
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
    const { date, description, reference, status, lines } = body;

    if (!date || !description || !lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: date, description, and at least one line' },
        { status: 400 }
      );
    }

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'A journal entry must have at least 2 lines (double-entry)' },
        { status: 400 }
      );
    }

    // Validate lines have required fields
    for (const line of lines) {
      if (!line.accountId) {
        return NextResponse.json(
          { error: 'Each line must have an accountId' },
          { status: 400 }
        );
      }
      if (typeof line.debit !== 'number' || typeof line.credit !== 'number') {
        return NextResponse.json(
          { error: 'Each line must have numeric debit and credit values' },
          { status: 400 }
        );
      }
      if (line.debit < 0 || line.credit < 0) {
        return NextResponse.json(
          { error: 'Debit and credit values must be non-negative' },
          { status: 400 }
        );
      }
    }

    // Verify all referenced accounts exist and belong to the user
    const accountIds = [...new Set(lines.map((l: { accountId: string }) => l.accountId))];
        const accounts = await db.account.findMany({
      where: {
        id: { in: accountIds },
        ...tenantFilter(ctx),
        isActive: true,
      },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map(a => a.id));
      const missingIds = accountIds.filter((id: string) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate double-entry balance: total debit === total credit
    const totalDebit = lines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

    // Use a small epsilon for floating-point comparison
    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return NextResponse.json(
        { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
        { status: 400 }
      );
    }

    // Validate status
    const entryStatus = status || 'DRAFT';
    if (!Object.values(JournalEntryStatus).includes(entryStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${Object.values(JournalEntryStatus).join(', ')}` },
        { status: 400 }
      );
    }

    const entry = await db.journalEntry.create({
      data: {
        date: new Date(date),
        description,
        reference: reference || null,
        status: entryStatus,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
        lines: {
          create: lines.map((l: { accountId: string; debit: number; credit: number; description?: string; vatCode?: string }) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            description: l.description || null,
            vatCode: (l.vatCode as VATCode | undefined) ?? null,
          })),
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

    await auditCreate(
      ctx.id,
      'JournalEntry',
      entry.id,
      { date, description, reference, status: entryStatus, lineCount: lines.length, totalDebit, totalCredit },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    // Trigger initial backup on first tenant data input
    ensureInitialBackup(ctx.activeCompanyId!, ctx.id);

    return NextResponse.json({ journalEntry: entry }, { status: 201 });
  } catch (error) {
    logger.error('Create journal entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

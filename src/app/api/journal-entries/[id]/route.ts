import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { VATCode } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// GET - Get a single journal entry with lines
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // demo filter now included in tenantFilter
    const entry = await db.journalEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    return NextResponse.json({ journalEntry: entry });
  } catch (error) {
    logger.error('Get journal entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update a journal entry (only DRAFT entries can be edited)
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await context.params;
    const body = await request.json();
    const { date, description, reference, status, lines } = body;

    // demo filter now included in tenantFilter
    const existing = await db.journalEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
      include: {
        lines: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only DRAFT journal entries can be edited' },
        { status: 400 }
      );
    }

    // If lines are provided, validate them
    if (lines && Array.isArray(lines)) {
      if (lines.length < 2) {
        return NextResponse.json(
          { error: 'A journal entry must have at least 2 lines (double-entry)' },
          { status: 400 }
        );
      }

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
        const missingIds = accountIds.filter((aid: string) => !foundIds.has(aid));
        return NextResponse.json(
          { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
          { status: 400 }
        );
      }

      // Re-validate double-entry balance
      const totalDebit = lines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
      const totalCredit = lines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return NextResponse.json(
          { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
          { status: 400 }
        );
      }
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (date !== undefined) updateData.date = new Date(date);
    if (description !== undefined) updateData.description = description;
    if (reference !== undefined) updateData.reference = reference || null;
    if (status !== undefined) updateData.status = status;

    // Update the entry
    const entry = await db.journalEntry.update({
      where: { id },
      data: updateData,
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    // If lines are provided, replace all lines (delete old, create new)
    if (lines && Array.isArray(lines)) {
      await db.journalEntryLine.deleteMany({
        where: { journalEntryId: id },
      });

      await db.journalEntryLine.createMany({
        data: lines.map((l: { accountId: string; debit: number; credit: number; description?: string; vatCode?: string }) => ({
          journalEntryId: id,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description || null,
          vatCode: (l.vatCode as VATCode | undefined) ?? null,
        })),
      });

      // Re-fetch with updated lines
      entry.lines = await db.journalEntryLine.findMany({
        where: { journalEntryId: id },
        include: { account: true },
      });
    }

    await auditUpdate(
      ctx.id,
      'JournalEntry',
      id,
      { date: existing.date, description: existing.description, reference: existing.reference, status: existing.status, lineCount: existing.lines.length },
      { ...updateData, lineCount: lines ? lines.length : existing.lines.length },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ journalEntry: entry });
  } catch (error) {
    logger.error('Update journal entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Cancel a journal entry (only DRAFT entries can be cancelled)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const reason = searchParams.get('reason') || 'Cancelled via DELETE request';

    // demo filter now included in tenantFilter
    const existing = await db.journalEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only DRAFT journal entries can be cancelled' },
        { status: 400 }
      );
    }

    if (existing.cancelled) {
      return NextResponse.json(
        { error: 'Journal entry is already cancelled' },
        { status: 400 }
      );
    }

    const entry = await db.journalEntry.update({
      where: { id },
      data: {
        cancelled: true,
        status: 'CANCELLED',
        cancelReason: reason,
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    await auditCancel(
      ctx.id,
      'JournalEntry',
      id,
      reason,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ journalEntry: entry });
  } catch (error) {
    logger.error('Cancel journal entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

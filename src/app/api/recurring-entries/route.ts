import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { RecurringFrequency, RecurringStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// ─── Helper: Calculate next execution date based on frequency ─────────────

function addFrequency(baseDate: Date, frequency: RecurringFrequency): Date {
  const next = new Date(baseDate);
  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + 1);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

// ─── GET - List recurring entries for the authenticated user ──────────────

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    
    const where: Record<string, unknown> = { ...tenantFilter(ctx) };

    if (statusFilter && Object.values(RecurringStatus).includes(statusFilter as RecurringStatus)) {
      where.status = statusFilter;
    }

    const entries = await db.recurringEntry.findMany({
      where,
      orderBy: { nextExecution: 'asc' },
    });

    // Determine isOverdue: nextExecution <= today and status is ACTIVE
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enrichedEntries = entries.map((entry) => {
      const nextExec = new Date(entry.nextExecution);
      nextExec.setHours(0, 0, 0, 0);
      const isOverdue = entry.status === 'ACTIVE' && nextExec <= today;
      return { ...entry, isOverdue };
    });

    return NextResponse.json({ recurringEntries: enrichedEntries });
  } catch (error) {
    logger.error('List recurring entries error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST - Create a new recurring entry template ─────────────────────────

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
    const { name, description, frequency, startDate, endDate, lines, reference } = body;

    // Validate required fields
    if (!name || !description || !frequency || !startDate || !lines) {
      return NextResponse.json(
        { error: 'Missing required fields: name, description, frequency, startDate, lines' },
        { status: 400 }
      );
    }

    // Validate frequency
    if (!Object.values(RecurringFrequency).includes(frequency)) {
      return NextResponse.json(
        { error: `Invalid frequency. Must be one of: ${Object.values(RecurringFrequency).join(', ')}` },
        { status: 400 }
      );
    }

    // Validate lines
    if (!Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json(
        { error: 'A recurring entry must have at least 2 lines (double-entry)' },
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
      const missingIds = accountIds.filter((id: string) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate double-entry balance
    const totalDebit = lines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.005) {
      return NextResponse.json(
        { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
        { status: 400 }
      );
    }

    // Compute nextExecution from startDate
    const start = new Date(startDate);
    const nextExecution = new Date(start);

    const entry = await db.recurringEntry.create({
      data: {
        name,
        description,
        frequency,
        startDate: start,
        endDate: endDate ? new Date(endDate) : null,
        nextExecution,
        lines: JSON.stringify(lines),
        reference: reference || null,
        userId: ctx.id,
        companyId: ctx.activeCompanyId!,
        isDemo: ctx.isDemoCompany,
      },
    });

    await auditCreate(
      ctx.id,
      'RecurringEntry',
      entry.id,
      { name, description, frequency, startDate, endDate, reference, lineCount: lines.length, totalDebit, totalCredit },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ recurringEntry: entry }, { status: 201 });
  } catch (error) {
    logger.error('Create recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── PUT - Update a recurring entry template ──────────────────────────────

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
    const { id, name, description, frequency, status, endDate, lines, reference } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    
    // Fetch existing entry
    const existing = await db.recurringEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
    }

    // Validate status if provided
    if (status !== undefined && !Object.values(RecurringStatus).includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${Object.values(RecurringStatus).join(', ')}` },
        { status: 400 }
      );
    }

    // Validate frequency if provided
    if (frequency !== undefined && !Object.values(RecurringFrequency).includes(frequency)) {
      return NextResponse.json(
        { error: `Invalid frequency. Must be one of: ${Object.values(RecurringFrequency).join(', ')}` },
        { status: 400 }
      );
    }

    // If lines are provided, validate them
    if (lines !== undefined) {
      if (!Array.isArray(lines) || lines.length < 2) {
        return NextResponse.json(
          { error: 'A recurring entry must have at least 2 lines (double-entry)' },
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
      const accountsForUpdate = await db.account.findMany({
        where: {
          id: { in: accountIds },
          ...tenantFilter(ctx),
          isActive: true,
        },
      });

      if (accountsForUpdate.length !== accountIds.length) {
        const foundIds = new Set(accountsForUpdate.map(a => a.id));
        const missingIds = accountIds.filter((aid: string) => !foundIds.has(aid));
        return NextResponse.json(
          { error: `Invalid or inactive account IDs: ${missingIds.join(', ')}` },
          { status: 400 }
        );
      }

      // Validate double-entry balance
      const totalDebit = lines.reduce((sum: number, l: { debit: number }) => sum + l.debit, 0);
      const totalCredit = lines.reduce((sum: number, l: { credit: number }) => sum + l.credit, 0);

      if (Math.abs(totalDebit - totalCredit) > 0.005) {
        return NextResponse.json(
          { error: `Journal entry is not balanced. Total debit: ${totalDebit}, Total credit: ${totalCredit}` },
          { status: 400 }
        );
      }
    }

    // Build update data — only allowed fields
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (frequency !== undefined) updateData.frequency = frequency;
    if (status !== undefined) updateData.status = status;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (lines !== undefined) updateData.lines = JSON.stringify(lines);
    if (reference !== undefined) updateData.reference = reference || null;

    // Recalculate nextExecution if frequency or dates change
    const frequencyChanged = frequency !== undefined && frequency !== existing.frequency;
    const startDateChanged = false; // startDate is immutable after creation
    const endDateChanged = endDate !== undefined;

    if (frequencyChanged || endDateChanged) {
      // Use current nextExecution as the base, recalculating from the existing lastExecuted or startDate
      const baseDate = existing.lastExecuted
        ? new Date(existing.lastExecuted)
        : new Date(existing.startDate);

      const newFrequency = frequency || existing.frequency;
      const recalculatedNext = addFrequency(baseDate, newFrequency as RecurringFrequency);

      // If recalculated next is past endDate, set to COMPLETED
      const newEndDate = endDate !== undefined ? (endDate ? new Date(endDate) : null) : existing.endDate;

      if (newEndDate && recalculatedNext > newEndDate) {
        updateData.status = 'COMPLETED';
      }

      updateData.nextExecution = recalculatedNext;
    }

    const entry = await db.recurringEntry.update({
      where: { id },
      data: updateData,
    });

    const oldData: Record<string, unknown> = {
      name: existing.name,
      description: existing.description,
      frequency: existing.frequency,
      status: existing.status,
      endDate: existing.endDate,
      reference: existing.reference,
    };

    const newData: Record<string, unknown> = {
      name: entry.name,
      description: entry.description,
      frequency: entry.frequency,
      status: entry.status,
      endDate: entry.endDate,
      reference: entry.reference,
      nextExecution: entry.nextExecution,
    };

    await auditUpdate(
      ctx.id,
      'RecurringEntry',
      id,
      oldData,
      newData,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ recurringEntry: entry });
  } catch (error) {
    logger.error('Update recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── DELETE - Soft-cancel a recurring entry (set status to COMPLETED) ─────

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

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing required field: id' },
        { status: 400 }
      );
    }

    
    const existing = await db.recurringEntry.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Recurring entry not found' }, { status: 404 });
    }

    if (existing.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Recurring entry is already completed/cancelled' },
        { status: 400 }
      );
    }

    const entry = await db.recurringEntry.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    await auditCancel(
      ctx.id,
      'RecurringEntry',
      id,
      'Cancelled via DELETE request',
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ recurringEntry: entry });
  } catch (error) {
    logger.error('Delete recurring entry error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

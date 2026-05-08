import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditUpdate, auditCancel, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// PUT - Lock/unlock a fiscal period
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
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action !== 'lock' && action !== 'unlock') {
      return NextResponse.json(
        { error: 'Invalid action. Use ?action=lock or ?action=unlock' },
        { status: 400 }
      );
    }

    
    const period = await db.fiscalPeriod.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!period) {
      return NextResponse.json({ error: 'Fiscal period not found' }, { status: 404 });
    }

    if (action === 'lock') {
      // Only OPEN periods can be locked
      if (period.status !== 'OPEN') {
        return NextResponse.json(
          { error: 'Only OPEN fiscal periods can be locked' },
          { status: 400 }
        );
      }

      // Verify no DRAFT journal entries exist in this period
      const periodStart = new Date(period.year, period.month - 1, 1);
      const periodEnd = new Date(period.year, period.month, 0, 23, 59, 59, 999);

      const draftEntries = await db.journalEntry.count({
        where: {
          ...tenantFilter(ctx),
          status: 'DRAFT',
          date: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      if (draftEntries > 0) {
        return NextResponse.json(
          { error: `Cannot lock period: ${draftEntries} draft journal entry(s) exist in this period. Post or cancel them first.` },
          { status: 400 }
        );
      }

      const updated = await db.fiscalPeriod.update({
        where: { id },
        data: {
          status: 'CLOSED',
          lockedAt: new Date(),
          lockedBy: ctx.id,
        },
      });

      await auditUpdate(
        ctx.id,
        'FiscalPeriod',
        id,
        { status: 'OPEN', lockedAt: null, lockedBy: null },
        { status: 'CLOSED', lockedAt: updated.lockedAt, lockedBy: ctx.id },
        requestMetadata(request),
        ctx.activeCompanyId
      );

      return NextResponse.json({ fiscalPeriod: updated });
    }

    // action === 'unlock'
    if (period.status !== 'CLOSED') {
      return NextResponse.json(
        { error: 'Only CLOSED fiscal periods can be unlocked' },
        { status: 400 }
      );
    }

    const updated = await db.fiscalPeriod.update({
      where: { id },
      data: {
        status: 'OPEN',
        lockedAt: null,
        lockedBy: null,
      },
    });

    await auditUpdate(
      ctx.id,
      'FiscalPeriod',
      id,
      { status: 'CLOSED', lockedAt: period.lockedAt, lockedBy: period.lockedBy },
      { status: 'OPEN', lockedAt: null, lockedBy: null },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ fiscalPeriod: updated });
  } catch (error) {
    logger.error('Update fiscal period error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, auditUpdate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// GET - Get single bank connection
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const connection = await db.bankConnection.findFirst({
      where: { id, ...tenantFilter(ctx) },
      include: {
        syncs: {
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        bankStatements: {
          orderBy: { startDate: 'desc' },
          take: 5,
          include: {
            lines: {
              orderBy: { date: 'desc' },
            },
          },
        },
      },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'Bankforbindelse ikke fundet' },
        { status: 404 }
      );
    }

    return NextResponse.json({ connection });
  } catch (error) {
    logger.error('Get bank connection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete a bank connection (revoke consent)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await params;

    const connection = await db.bankConnection.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'Bankforbindelse ikke fundet' },
        { status: 404 }
      );
    }

    // Mark as revoked instead of deleting (compliance: keep audit trail)
    await db.bankConnection.update({
      where: { id },
      data: {
        status: 'REVOKED',
        accessToken: null,
        refreshToken: null,
        consentExpiresAt: new Date(),
      },
    });

    await auditCreate(
      ctx.id,
      'BankConnection',
      id,
      { action: 'revoke', bankName: connection.bankName, accountNumber: connection.accountNumber },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Delete bank connection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update connection settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const { id } = await params;
    const body = await request.json();
    const { syncFrequency, accountName } = body;

    const connection = await db.bankConnection.findFirst({
      where: { id, ...tenantFilter(ctx) },
    });

    if (!connection) {
      return NextResponse.json(
        { error: 'Bankforbindelse ikke fundet' },
        { status: 404 }
      );
    }

    const oldData = { syncFrequency: connection.syncFrequency, accountName: connection.accountName };

    const updateData: Record<string, unknown> = {};
    if (syncFrequency && ['hourly', 'daily', 'manual'].includes(syncFrequency)) {
      updateData.syncFrequency = syncFrequency;
      // Update nextSyncAt based on new frequency
      if (syncFrequency === 'manual') {
        updateData.nextSyncAt = null;
      } else {
        const nextSync = new Date();
        if (syncFrequency === 'hourly') {
          nextSync.setHours(nextSync.getHours() + 1);
        } else {
          nextSync.setDate(nextSync.getDate() + 1);
          nextSync.setHours(6, 0, 0, 0);
        }
        updateData.nextSyncAt = nextSync;
      }
    }
    if (accountName !== undefined) {
      updateData.accountName = accountName;
    }

    const updated = await db.bankConnection.update({
      where: { id },
      data: updateData,
    });

    await auditUpdate(
      ctx.id,
      'BankConnection',
      id,
      oldData,
      updateData,
      requestMetadata(request),
      ctx.activeCompanyId
    );

    return NextResponse.json({ connection: updated });
  } catch (error) {
    logger.error('Update bank connection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

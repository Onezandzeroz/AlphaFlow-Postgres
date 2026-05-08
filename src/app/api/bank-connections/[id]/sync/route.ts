import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { performSync } from '@/app/api/bank-connections/route';
import { requirePermission, tenantFilter, companyScope, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';

// POST - Trigger manual sync for a bank connection
export async function POST(
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

    if (connection.status === 'REVOKED') {
      return NextResponse.json(
        { error: 'Bankforbindelse er tilbagekaldt' },
        { status: 400 }
      );
    }

    // Check if already syncing
    const pendingSync = await db.bankConnectionSync.findFirst({
      where: {
        bankConnectionId: id,
        status: 'PENDING',
      },
    });

    if (pendingSync) {
      return NextResponse.json(
        { error: 'Synkronisering er allerede i gang', syncId: pendingSync.id },
        { status: 409 }
      );
    }

    await auditCreate(
      ctx.id,
      'BankConnection',
      id,
      { action: 'manual_sync', bankName: connection.bankName },
      requestMetadata(request),
      ctx.activeCompanyId
    );

    const result = await performSync(id, ctx.id, ctx.isDemoCompany);

    return NextResponse.json({ sync: result });
  } catch (error) {
    logger.error('Manual sync error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

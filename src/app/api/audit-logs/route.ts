import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';
import { requirePermission, companyScope, Permission } from '@/lib/rbac';

// GET - List audit logs with pagination and filtering
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const action = searchParams.get('action') || undefined;
    const entityType = searchParams.get('entityType') || undefined;

    // Build where clause — use companyScope (NOT tenantFilter) because
    // AuditLog doesn't have an isDemo field, so tenantFilter's isDemo
    // filter would cause a Prisma error.
    const where: Record<string, unknown> = { ...companyScope(ctx) };
    if (action) {
      where.action = action;
    }
    if (entityType) {
      where.entityType = entityType;
    }

    // Fetch logs and total count in parallel
    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, limit });
  } catch (error) {
    logger.error('List audit logs error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

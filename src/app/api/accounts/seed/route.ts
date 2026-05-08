import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { blockOversightMutation, requireNotDemoCompany, tenantFilter } from '@/lib/rbac';
import { seedChartOfAccounts } from '@/lib/seed-chart-of-accounts';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    if (!ctx.activeCompanyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 });
    }

    // Seed the standard Danish chart of accounts for the current demo mode
    const count = await seedChartOfAccounts(ctx.id, ctx.activeCompanyId, ctx.isDemoCompany);

    // Auto-create fiscal periods for the current year (idempotent)
    const currentYear = new Date().getFullYear();
    let periodsCreated = 0;
    const existingPeriods = await db.fiscalPeriod.findMany({
      where: { ...tenantFilter(ctx), year: currentYear },
    });
    if (existingPeriods.length === 0) {
      await db.fiscalPeriod.createMany({
        data: Array.from({ length: 12 }, (_, i) => ({
          year: currentYear,
          month: i + 1,
          status: 'OPEN' as const,
          userId: ctx.id,
          companyId: ctx.activeCompanyId!,
          isDemo: ctx.isDemoCompany,
        })),
      });
      periodsCreated = 12;
    }

    await auditLog({
      action: 'CREATE',
      entityType: 'Account',
      entityId: ctx.activeCompanyId!,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      metadata: { type: 'chart_seed', count, periodsCreated, periodYear: currentYear },
    });

    return NextResponse.json({ seeded: true, count, periodsCreated, periodYear: currentYear });
  } catch (error) {
    logger.error('[Seed Chart of Accounts] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

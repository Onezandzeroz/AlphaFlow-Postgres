import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/oversight/switch — Switch to oversight mode for a specific tenant.
 *
 * Only accessible by isSuperDev (AlphaAi App Owner).
 * Sets oversightCompanyId on the session, logs an OVERSIGHT audit entry.
 * All data will be scoped to the chosen tenant in read-only mode.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!ctx.isSuperDev) {
      return NextResponse.json({ error: 'Forbidden: App Owner access required' }, { status: 403 });
    }

    const { companyId } = await request.json();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    // Verify company exists
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, isActive: true },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Cannot oversee own company via oversight (just switch normally)
    if (company.id === ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Use normal company switch for your own tenant' }, { status: 400 });
    }

    // Set oversightCompanyId on the session
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 });
    }

    await db.session.update({
      where: { token },
      data: { oversightCompanyId: companyId },
    });

    // Log single OVERSIGHT audit entry in the target tenant's audit log
    await auditLog({
      action: 'OVERSIGHT',
      entityType: 'Company',
      entityId: companyId,
      userId: ctx.id,
      companyId: companyId,
      performedByUserId: ctx.id,
      metadata: {
        ...requestMetadata(request),
        oversightBy: ctx.email,
        targetCompanyName: company.name,
        targetCompanyId: companyId,
        type: 'oversight_access',
      },
    });

    // Also log in the AlphaAi owner's own tenant
    await auditLog({
      action: 'OVERSIGHT',
      entityType: 'Company',
      entityId: companyId,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      performedByUserId: ctx.id,
      metadata: {
        ...requestMetadata(request),
        targetCompanyName: company.name,
        targetCompanyId: companyId,
        type: 'oversight_initiated',
      },
    });

    return NextResponse.json({
      success: true,
      oversightCompanyId: companyId,
      oversightCompanyName: company.name,
      isOversightMode: true,
    });
  } catch (error) {
    logger.error('Switch oversight error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

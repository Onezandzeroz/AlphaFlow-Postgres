import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { blockOversightMutation } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { auditLog, requestMetadata } from '@/lib/audit';

// POST /api/company/switch - Switch active company for current session
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Block company switching while in oversight mode
    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const { companyId } = await request.json();
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 });
    }

    // SUPER_DEV can switch to any company
    if (!ctx.isSuperDev) {
      // Verify user belongs to this company
      const membership = await db.userCompany.findUnique({
        where: { userId_companyId: { userId: ctx.id, companyId } },
      });
      if (!membership) {
        return NextResponse.json({ error: 'Not a member of this company' }, { status: 403 });
      }
    }

    // Verify company exists and is active
    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company || !company.isActive) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Capture old company for audit before switching
    const oldCompanyId = ctx.activeCompanyId;

    // Update session's activeCompanyId
    // Get current session token from cookie
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (token) {
      await db.session.update({
        where: { token },
        data: { activeCompanyId: companyId },
      });
    }

    // Log audit for the new company
    await auditLog({
      action: 'UPDATE',
      entityType: 'User',
      entityId: ctx.id,
      companyId,
      userId: ctx.id,
      changes: { activeCompanyId: { old: oldCompanyId, new: companyId } },
      metadata: requestMetadata(request),
    });

    // Log audit for the old company (if different)
    if (oldCompanyId && oldCompanyId !== companyId) {
      await auditLog({
        action: 'UPDATE',
        entityType: 'User',
        entityId: ctx.id,
        companyId: oldCompanyId,
        userId: ctx.id,
        changes: { activeCompanyId: { old: oldCompanyId, new: companyId } },
        metadata: requestMetadata(request),
      });
    }

    // Get user's role in the new company
    const membership = await db.userCompany.findUnique({
      where: { userId_companyId: { userId: ctx.id, companyId } },
      select: { role: true },
    });

    // Append "- App-owner" to company name if user is SuperDev and company is AlphaAi
    const displayCompanyName = (ctx.isSuperDev && company.name === 'AlphaAi')
      ? 'AlphaAi - App-owner'
      : company.name;

    return NextResponse.json({
      success: true,
      companyId,
      companyName: displayCompanyName,
      isDemoCompany: company.isDemo,
      role: membership?.role ?? (ctx.isSuperDev ? 'OWNER' : null),
    });
  } catch (error) {
    logger.error('Switch company error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

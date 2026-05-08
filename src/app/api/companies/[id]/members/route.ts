import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission } from '@/lib/rbac';
import { logger } from '@/lib/logger';

/**
 * GET /api/companies/[id]/members — List all members of a company
 *
 * Requires MEMBERS_VIEW permission (≥ ADMIN).
 * SuperDev in oversight mode can also view.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const forbidden = requirePermission(ctx, Permission.MEMBERS_VIEW);
    if (forbidden) return forbidden;

    const { id: companyId } = await params;

    // Verify user belongs to this company (or is SuperDev)
    const membership = await db.userCompany.findUnique({
      where: { userId_companyId: { userId: ctx.id, companyId } },
    });
    if (!membership && !ctx.isSuperDev) {
      return NextResponse.json({ error: 'Not a member of this company' }, { status: 403 });
    }

    const members = await db.userCompany.findMany({
      where: { companyId },
      include: {
        user: {
          select: { id: true, email: true, businessName: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return NextResponse.json({
      members: members.map(m => ({
        userId: m.user.id,
        email: m.user.email,
        businessName: m.user.businessName,
        role: m.role,
        joinedAt: m.joinedAt,
        invitedBy: m.invitedBy,
      })),
    });
  } catch (error) {
    logger.error('List members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission, blockOversightMutation } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { auditUpdate, auditDeleteAttempt, requestMetadata } from '@/lib/audit';

// GET /api/companies/[id]/members - List members of a company
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

    // Verify user belongs to this company
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

// PUT /api/companies/[id]/members/[userId] - Change member role
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const forbidden = requirePermission(ctx, Permission.MEMBERS_CHANGE_ROLE);
    if (forbidden) return forbidden;

    const { id: companyId, userId: targetUserId } = await params;
    const { role } = await request.json();

    if (!role || !['OWNER', 'ADMIN', 'ACCOUNTANT', 'VIEWER', 'AUDITOR'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Don't allow changing own role
    if (ctx.id === targetUserId) {
      return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 });
    }

    const target = await db.userCompany.findUnique({
      where: { userId_companyId: { userId: targetUserId, companyId } },
    });

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot change OWNER's role unless you're also OWNER
    if (target.role === 'OWNER' && ctx.activeCompanyRole !== 'OWNER') {
      return NextResponse.json({ error: 'Cannot change OWNER role' }, { status: 403 });
    }

    // Capture old role before update
    const oldRole = target.role;

    await db.userCompany.update({
      where: { id: target.id },
      data: { role: role as 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'VIEWER' | 'AUDITOR' },
    });

    // Audit: log role change
    await auditUpdate(ctx.id, 'UserCompany', target.id, { role: oldRole }, { role }, requestMetadata(request), ctx.activeCompanyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Change member role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/companies/[id]/members/[userId] - Remove member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const forbidden = requirePermission(ctx, Permission.MEMBERS_REMOVE);
    if (forbidden) return forbidden;

    const { id: companyId, userId: targetUserId } = await params;

    // Don't allow removing yourself
    if (ctx.id === targetUserId) {
      return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });
    }

    const target = await db.userCompany.findUnique({
      where: { userId_companyId: { userId: targetUserId, companyId } },
    });

    if (!target) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Cannot remove OWNER
    if (target.role === 'OWNER') {
      return NextResponse.json({ error: 'Cannot remove OWNER. Transfer ownership first.' }, { status: 403 });
    }

    // Audit: log member removal before deleting
    await auditDeleteAttempt(ctx.id, 'UserCompany', target.id, requestMetadata(request), ctx.activeCompanyId);

    await db.userCompany.delete({
      where: { id: target.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Remove member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

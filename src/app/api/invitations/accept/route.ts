import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { logger } from '@/lib/logger';
import { blockOversightMutation } from '@/lib/rbac';
import { auditCreate, requestMetadata } from '@/lib/audit';

// POST /api/invitations/accept - Accept invitation
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Authentication required to accept invitation' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const invitation = await db.invitation.findUnique({
      where: { token },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json({ error: `Invitation already ${invitation.status.toLowerCase()}` }, { status: 400 });
    }

    if (invitation.expiresAt < new Date()) {
      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
    }

    // Check if user is already a member
    const existingMember = await db.userCompany.findUnique({
      where: { userId_companyId: { userId: ctx.id, companyId: invitation.companyId } },
    });

    if (existingMember) {
      // Mark invitation as accepted anyway
      await db.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedBy: ctx.id },
      });
      return NextResponse.json({ 
        message: 'Already a member of this company',
        companyId: invitation.companyId,
        companyName: invitation.company.name,
        role: existingMember.role,
      });
    }

    // Create membership
    const membership = await db.userCompany.create({
      data: {
        userId: ctx.id,
        companyId: invitation.companyId,
        role: invitation.role,
        invitedBy: invitation.invitedBy,
      },
    });

    // Audit: log membership creation
    await auditCreate(ctx.id, 'UserCompany', membership.id, { companyId: invitation.companyId, role: invitation.role }, requestMetadata(request), invitation.companyId);

    // Mark invitation as accepted
    await db.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date(), acceptedBy: ctx.id },
    });

    return NextResponse.json({
      success: true,
      companyId: invitation.companyId,
      companyName: invitation.company.name,
      role: invitation.role,
    });
  } catch (error) {
    logger.error('Accept invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

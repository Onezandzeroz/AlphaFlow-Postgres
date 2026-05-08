import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { requirePermission, Permission, blockOversightMutation, requireNotDemoCompany } from '@/lib/rbac';
import { logger } from '@/lib/logger';
import { auditCancel, requestMetadata } from '@/lib/audit';

// DELETE /api/companies/[id]/invitations/[inviteId] - Revoke invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const demoBlocked = requireNotDemoCompany(ctx);
    if (demoBlocked) return demoBlocked;

    const forbidden = requirePermission(ctx, Permission.MEMBERS_INVITE);
    if (forbidden) return forbidden;

    const { id: companyId, inviteId } = await params;

    const invitation = await db.invitation.findFirst({
      where: { id: inviteId, companyId },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Audit: log invitation revocation before updating
    await auditCancel(ctx.id, 'Invitation', inviteId, 'Revoked by ' + ctx.id, requestMetadata(request), ctx.activeCompanyId);

    await db.invitation.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Revoke invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

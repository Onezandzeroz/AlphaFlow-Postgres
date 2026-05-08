import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext, destroyAllUserSessions } from '@/lib/session';
import { blockOversightMutation } from '@/lib/rbac';
import { cookies } from 'next/headers';
import { logger } from '@/lib/logger';
import { auditLog } from '@/lib/audit';

/**
 * DELETE /api/auth/delete-account
 *
 * Permanently deletes the user account and ALL associated data.
 * No remnants remain — every trace of the user is removed.
 *
 * Order of operations:
 *   1. Destroy all sessions
 *   2. Delete invitations sent by this user
 *   3. Delete pending invitations targeting this user's email
 *   4. Delete audit logs where this user performed an action on someone else
 *   5. Find all companies where the user is a member
 *   6. For companies where the user is the SOLE member → delete the company
 *      (cascades: all company data, remaining memberships, etc.)
 *   7. Delete the user (cascade handles: transactions, invoices, accounts,
 *      journal entries, contacts, fiscal periods, bank statements,
 *      bank connections, recurring entries, budgets, backups,
 *      user-company memberships, and user-authored audit logs)
 *   8. Clear cookies
 */
export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext(request);

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    // Verify user exists
    const existingUser = await db.user.findUnique({
      where: { id: ctx.id },
      select: { id: true, email: true },
    });
    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userId = ctx.id;
    const userEmail = existingUser.email;

    // Audit log BEFORE any deletion
    await auditLog({
      action: 'DELETE_ATTEMPT',
      entityType: 'User',
      entityId: userId,
      companyId: ctx.activeCompanyId,
      userId,
      metadata: { email: userEmail, reason: 'self_account_deletion', timestamp: new Date().toISOString() },
    });

    logger.info(`[DELETE_ACCOUNT] Starting complete removal for user ${userId} (${userEmail})`);

    // ─── Step 1: Destroy all sessions ────────────────────────────────────
    await destroyAllUserSessions(userId);

    // ─── Step 2: Delete invitations sent by this user ────────────────────
    const sentInvitations = await db.invitation.deleteMany({
      where: { invitedBy: userId },
    });
    logger.info(`[DELETE_ACCOUNT] Deleted ${sentInvitations.count} invitations sent by user`);

    // ─── Step 3: Delete pending invitations targeting this user's email ──
    const receivedInvitations = await db.invitation.deleteMany({
      where: { email: userEmail, status: 'PENDING' },
    });
    logger.info(`[DELETE_ACCOUNT] Deleted ${receivedInvitations.count} pending invitations for ${userEmail}`);

    // ─── Step 4: Remove audit logs where this user performed actions ─────
    const performedAudits = await db.auditLog.deleteMany({
      where: { performedByUserId: userId },
    });
    logger.info(`[DELETE_ACCOUNT] Deleted ${performedAudits.count} performed-by audit logs`);

    // ─── Step 5: Find all companies the user belongs to ──────────────────
    const memberships = await db.userCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const companyIds = memberships.map(m => m.companyId);

    // ─── Step 6: Delete orphaned companies (sole member) ─────────────────
    for (const companyId of companyIds) {
      const memberCount = await db.userCompany.count({
        where: { companyId },
      });

      if (memberCount <= 1) {
        // User is the only member — delete the entire company (cascade removes everything)
        // Also clean up any remaining invitations for this company
        await db.invitation.deleteMany({ where: { companyId } });

        // Remove sessions pointing to this company
        await db.session.deleteMany({
          where: {
            OR: [
              { activeCompanyId: companyId },
              { oversightCompanyId: companyId },
            ],
          },
        });

        await db.company.delete({ where: { id: companyId } });
        logger.info(`[DELETE_ACCOUNT] Deleted orphaned company ${companyId}`);
      }
    }

    // ─── Step 7: Delete the user (cascade handles all user-owned data) ───
    await db.user.delete({ where: { id: userId } });

    // ─── Step 8: Clear cookies ───────────────────────────────────────────
    const cookieStore = await cookies();
    cookieStore.delete('session');
    cookieStore.delete('userId');

    logger.info(`[DELETE_ACCOUNT] Complete removal finished for user ${userId}`);

    return NextResponse.json({
      success: true,
      message: 'Account and all associated data permanently deleted',
    });
  } catch (error) {
    logger.error('Failed to delete account:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}

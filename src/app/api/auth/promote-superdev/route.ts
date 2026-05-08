import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/promote-superdev
 *
 * Promotes the current user to SuperDev (AlphaAi App Owner).
 *
 * Safety guard: only works if NO other SuperDev exists in the system.
 * This prevents accidental or unauthorized promotion after initial setup.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Guard: Only users belonging to a company named "AlphaAi" can become App Owner
    if (ctx.activeCompanyName !== 'AlphaAi') {
      return NextResponse.json(
        { error: 'Only the company named "AlphaAi" can be promoted to App Owner.' },
        { status: 403 }
      );
    }

    // Safety: Check if any SuperDev already exists
    const existingSuperDev = await db.user.findFirst({
      where: { isSuperDev: true },
      select: { id: true, email: true },
    });

    if (existingSuperDev) {
      return NextResponse.json(
        {
          error: 'A SuperDev (App Owner) already exists. Only one App Owner is allowed.',
          existingSuperDevEmail: existingSuperDev.email,
        },
        { status: 403 }
      );
    }

    // Promote the current user
    await db.user.update({
      where: { id: ctx.id },
      data: { isSuperDev: true },
    });

    // Audit the promotion
    await auditLog({
      action: 'UPDATE',
      entityType: 'User',
      entityId: ctx.id,
      userId: ctx.id,
      companyId: ctx.activeCompanyId,
      changes: { isSuperDev: { old: false, new: true } },
      metadata: {
        ...requestMetadata(request),
        type: 'superdev_promotion',
      },
    });

    return NextResponse.json({
      success: true,
      message: 'You have been promoted to SuperDev (AlphaAi App Owner). Please log out and log back in for changes to take effect.',
      isSuperDev: true,
    });
  } catch (error) {
    logger.error('Promote SuperDev error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

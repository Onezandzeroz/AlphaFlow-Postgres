import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { auditLog, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';

/**
 * POST /api/oversight/clear — Exit oversight mode and return to normal operation.
 *
 * Only accessible by isSuperDev (AlphaAi App Owner).
 * Clears oversightCompanyId on the session, restoring normal tenant scoping.
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

    if (!ctx.isOversightMode) {
      return NextResponse.json({ error: 'Not in oversight mode' }, { status: 400 });
    }

    // Capture oversight company ID before clearing
    const oversightCompanyId = ctx.oversightCompanyId;

    // Clear oversightCompanyId on the session
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 });
    }

    await db.session.update({
      where: { token },
      data: { oversightCompanyId: null },
    });

    // Log audit entry for exiting oversight mode
    await auditLog({
      action: 'OVERSIGHT',
      entityType: 'Company',
      entityId: oversightCompanyId || ctx.activeCompanyId || 'unknown',
      userId: ctx.id,
      companyId: oversightCompanyId || ctx.activeCompanyId || null,
      metadata: {
        ...requestMetadata(request),
        type: 'oversight_exited',
        targetCompanyId: oversightCompanyId,
      },
    });

    return NextResponse.json({
      success: true,
      isOversightMode: false,
    });
  } catch (error) {
    logger.error('Clear oversight error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

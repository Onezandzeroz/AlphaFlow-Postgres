import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { Permission, requirePermission, blockOversightMutation } from '@/lib/rbac';
import { createBackup, isAppOwnerCompany } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';

/**
 * GET /api/backups — List all backups for the active company
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = requirePermission(ctx, Permission.DATA_READ);
    if (denied) return denied;

    const companyId = ctx.activeCompanyId;

    const backups = await db.backup.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        triggerType: true,
        backupType: true,
        scope: true,
        filePath: true,
        fileSize: true,
        sha256: true,
        status: true,
        errorMessage: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ backups });
  } catch (error) {
    logger.error('[API /backups] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch backups' }, { status: 500 });
  }
}

/**
 * POST /api/backups — Create a manual backup for the active company
 *
 * - appOwner users → full-db backup (entire SQLite database)
 * - Regular tenant owners/admins → tenant-specific snapshot
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const denied = requirePermission(ctx, Permission.BACKUP_CREATE);
    if (denied) return denied;

    const companyId = ctx.activeCompanyId;
    const userId = ctx.id;

    // Determine backup scope: appOwner → full-db, regular tenants → tenant snapshot
    const appOwner = ctx.isSuperDev || await isAppOwnerCompany(companyId);
    const scope = appOwner ? 'full-db' : 'tenant';

    // Manual backups are always 'hourly' type for retention purposes
    const result = await createBackup(userId, 'manual', 'hourly', companyId, scope);

    if (!result) {
      return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
    }

    // Return the full backup record for the UI
    const backup = await db.backup.findUnique({
      where: { id: result.id },
      select: {
        id: true,
        triggerType: true,
        backupType: true,
        scope: true,
        filePath: true,
        fileSize: true,
        sha256: true,
        status: true,
        errorMessage: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ backup });
  } catch (error) {
    logger.error('[API /backups] POST failed:', error);
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  }
}

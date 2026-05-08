import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { Permission, requirePermission, blockOversightMutation } from '@/lib/rbac';
import { restoreBackup } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';
import fs from 'fs';

/**
 * POST /api/backups/[id]?action=restore — Restore from a backup
 *
 * Permission rules:
 * - "tenant" scope backup → only OWNER or appOwner (isSuperDev) can restore
 * - "full-db" scope backup → only appOwner (isSuperDev) can restore
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const { id } = await params;
    const companyId = ctx.activeCompanyId;
    const userId = ctx.id;

    // Verify the backup belongs to this company
    const backup = await db.backup.findFirst({
      where: { id, companyId },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    if (backup.status !== 'completed') {
      return NextResponse.json({ error: 'Cannot restore from a failed backup' }, { status: 400 });
    }

    // ─── Permission checks ─────────────────────────────────────────
    const backupScope = backup.scope || 'tenant';

    if (backupScope === 'full-db') {
      // Full DB restore: only appOwner (isSuperDev) can do this
      if (!ctx.isSuperDev) {
        return NextResponse.json(
          { error: 'Only the appOwner can perform a full database restore', code: 'REQUIRES_APP_OWNER' },
          { status: 403 }
        );
      }
    } else {
      // Tenant snapshot restore: only OWNER or appOwner (isSuperDev)
      const denied = requirePermission(ctx, Permission.BACKUP_RESTORE);
      if (denied) return denied;
    }

    const result = await restoreBackup(userId, id, companyId);

    if (!result.success) {
      logger.error(`[API /backups/${id}] Restore failed:`, result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Backup restored successfully' });
  } catch (error) {
    logger.error(`[API /backups] POST restore failed:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore backup' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/backups/[id] — Delete a backup
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const oversightBlocked = blockOversightMutation(ctx);
    if (oversightBlocked) return oversightBlocked;

    const denied = requirePermission(ctx, Permission.DATA_DELETE);
    if (denied) return denied;

    const { id } = await params;
    const companyId = ctx.activeCompanyId;

    // Verify the backup belongs to this company
    const backup = await db.backup.findFirst({
      where: { id, companyId },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    // Delete file from disk
    if (backup.filePath && fs.existsSync(backup.filePath)) {
      try {
        fs.unlinkSync(backup.filePath);
      } catch (err) {
        logger.warn(`[API /backups/${id}] Failed to delete file from disk:`, err);
      }
    }

    // Delete from database
    await db.backup.delete({ where: { id } });

    return NextResponse.json({ success: true, message: 'Backup deleted' });
  } catch (error) {
    logger.error(`[API /backups] DELETE failed:`, error);
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
  }
}

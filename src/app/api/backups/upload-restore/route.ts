import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/session';
import { Permission, requirePermission, blockOversightMutation } from '@/lib/rbac';
import { restoreBackupFromBuffer } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';
import JSZip from 'jszip';

/**
 * POST /api/backups/upload-restore — Restore from an uploaded backup ZIP file
 *
 * Permission rules:
 * - Tenant snapshot (contains manifest.json): only OWNER or appOwner
 * - Full DB backups are no longer supported (PostgreSQL migration)
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // In oversight mode: allow restore but only for the overseen tenant (not full-DB)
    const isOversight = ctx.isOversightMode && !!ctx.oversightCompanyId;
    if (!isOversight) {
      const oversightBlocked = blockOversightMutation(ctx);
      if (oversightBlocked) return oversightBlocked;
    }

    const denied = requirePermission(ctx, Permission.DATA_CREATE);
    if (denied) return denied;

    const companyId = ctx.activeCompanyId;
    const userId = ctx.id;
    // In oversight mode, treat as non-appOwner so full-DB restores are blocked
    const isAppOwner = ctx.isSuperDev && !isOversight;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('backup') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided. Use field name "backup".' }, { status: 400 });
    }

    if (!file.name.endsWith('.zip')) {
      return NextResponse.json({ error: 'File must be a .zip file. Backup files use the ZIP format.' }, { status: 400 });
    }

    // Allow up to 2 GB for database backups
    if (file.size > 2 * 1024 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 2 GB.' }, { status: 400 });
    }

    // Read file into buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // ─── Detect backup type and check permissions ────────────────────
    let zip: InstanceType<typeof JSZip>;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch {
      return NextResponse.json({ error: 'Uploaded file is not a valid ZIP archive' }, { status: 400 });
    }

    const hasManifest = zip.file('manifest.json') !== null;

    if (!hasManifest) {
      return NextResponse.json({
        error: 'Uploaded ZIP is not a valid tenant snapshot backup. Expected manifest.json.',
      }, { status: 400 });
    }

    // Tenant snapshot: OWNER, appOwner, or appOwner in oversight mode
    if (!isAppOwner && !isOversight) {
      const ownerDenied = requirePermission(ctx, Permission.BACKUP_RESTORE);
      if (ownerDenied) return ownerDenied;
    }

    logger.info(`[UPLOAD-RESTORE] Starting restore from uploaded file: ${file.name} (${(buffer.length / 1024 / 1024).toFixed(2)} MB), user: ${userId}, company: ${companyId}, appOwner: ${isAppOwner}, oversight: ${isOversight}`);

    // Perform the restore
    const result = await restoreBackupFromBuffer(userId, buffer, companyId, isAppOwner, file.name);

    if (!result.success) {
      logger.error(`[UPLOAD-RESTORE] Failed:`, result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully. The page will reload.',
      filename: file.name,
      fileSize: buffer.length,
    });
  } catch (error) {
    logger.error('[UPLOAD-RESTORE] Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restore backup' },
      { status: 500 }
    );
  }
}

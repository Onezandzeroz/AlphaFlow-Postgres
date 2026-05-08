import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { Permission, requirePermission } from '@/lib/rbac';
import { calculateChecksum } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/backups/download/[id] — Download a backup ZIP file
 *
 * Permission: Only tenant owners (OWNER role) or appOwner (isSuperDev) can download backups.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext(request);
    if (!ctx || !ctx.activeCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only OWNER or appOwner (isSuperDev) can download backups
    if (!ctx.isSuperDev) {
      const denied = requirePermission(ctx, Permission.BACKUP_RESTORE); // BACKUP_RESTORE = OWNER
      if (denied) return denied;
    }

    const { id } = await params;
    const companyId = ctx.activeCompanyId;

    // Verify the backup belongs to this company
    const backup = await db.backup.findFirst({
      where: { id, companyId, status: 'completed' },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    if (!backup.filePath || !fs.existsSync(backup.filePath)) {
      return NextResponse.json({ error: 'Backup file not found on disk' }, { status: 404 });
    }

    // Verify checksum before serving
    if (backup.sha256) {
      try {
        const currentChecksum = calculateChecksum(backup.filePath);
        if (currentChecksum !== backup.sha256) {
          logger.error(`[API /backups/download/${id}] Checksum mismatch! Stored: ${backup.sha256}, Current: ${currentChecksum}`);
          return NextResponse.json(
            { error: 'Backup file is corrupted (checksum mismatch)' },
            { status: 500 }
          );
        }
      } catch (err) {
        logger.warn(`[API /backups/download/${id}] Checksum verification failed:`, err);
        // Continue serving the file even if checksum fails — it's a warning, not a hard block
      }
    }

    // Read the file and serve it
    const fileBuffer = fs.readFileSync(backup.filePath);
    const filename = path.basename(backup.filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    logger.error(`[API /backups/download] GET failed:`, error);
    return NextResponse.json({ error: 'Failed to download backup' }, { status: 500 });
  }
}

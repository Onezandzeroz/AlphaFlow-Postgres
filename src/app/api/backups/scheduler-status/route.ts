import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthContext } from '@/lib/session';
import { Permission, requirePermission } from '@/lib/rbac';
import { getCronHealth, getSchedulerStatus } from '@/lib/backup-scheduler';
import { logger } from '@/lib/logger';

/**
 * GET /api/backups/scheduler-status — Get backup scheduler health for active company
 *
 * Returns:
 * - Per-company cron health (idle/pending/healthy/unhealthy)
 * - Scheduler running state
 * - Backup statistics (counts, storage, latest backup)
 * - Schedule definitions
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

    // Per-company cron health
    const cronHealth = getCronHealth(companyId);

    // Global scheduler status
    const schedulerInfo = getSchedulerStatus();

    // Aggregate backup statistics for this company
    const [totalBackups, completedBackups, failedCount, totalStorageResult, latestBackup] =
      await Promise.all([
        db.backup.count({ where: { companyId } }),
        db.backup.count({ where: { companyId, status: 'completed' } }),
        db.backup.count({ where: { companyId, status: 'failed' } }),
        db.backup.aggregate({
          where: { companyId, status: 'completed' },
          _sum: { fileSize: true },
        }),
        db.backup.findFirst({
          where: { companyId, status: 'completed' },
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            backupType: true,
            triggerType: true,
          },
        }),
      ]);

    // Auto backup counts per type
    const autoBackupCounts = await Promise.all(
      (['hourly', 'daily', 'weekly', 'monthly'] as const).map(async (type) => {
        const count = await db.backup.count({
          where: { companyId, backupType: type, triggerType: 'automatic', status: 'completed' },
        });
        const last = await db.backup.findFirst({
          where: { companyId, backupType: type, triggerType: 'automatic', status: 'completed' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        return {
          type,
          count,
          lastAt: last?.createdAt?.toISOString() ?? null,
        };
      })
    );

    return NextResponse.json({
      scheduler: {
        running: schedulerInfo.running,
        scheduledTasks: schedulerInfo.tasksCount,
        cronHealth,
        schedules: schedulerInfo.schedules,
        autoBackupCounts,
        stats: {
          totalBackupCount: totalBackups,
          completedBackupCount: completedBackups,
          failedCount,
          totalStorage: totalStorageResult._sum.fileSize ?? 0,
          latestBackup: latestBackup
            ? {
                createdAt: latestBackup.createdAt.toISOString(),
                backupType: latestBackup.backupType,
                triggerType: latestBackup.triggerType,
              }
            : null,
        },
      },
    });
  } catch (error) {
    logger.error('[API /backups/scheduler-status] GET failed:', error);
    return NextResponse.json({ error: 'Failed to fetch scheduler status' }, { status: 500 });
  }
}

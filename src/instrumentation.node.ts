/**
 * Node.js Instrumentation Hook (Next.js 16)
 *
 * This file runs ONLY in the Node.js Runtime — safe to use Node.js APIs
 * like fs, path, crypto, node-cron, etc.
 *
 * Initializes the backup scheduler for Danish Bookkeeping Act §15 compliance:
 * - Automated hourly/daily/weekly/monthly backups
 * - First-data-triggered initial backup
 * - Automatic retention cleanup
 *
 * @see https://nextjs.org/docs/app/building-your-application/configuring/instrumentation
 */

import { startBackupScheduler, stopBackupScheduler } from '@/lib/backup-scheduler';
import { logger } from '@/lib/logger';

export async function register() {
  logger.info('[INSTRUMENTATION-NODE] Server starting — initializing backup scheduler');
  startBackupScheduler();
}

export async function unregister() {
  logger.info('[INSTRUMENTATION-NODE] Server shutting down — stopping backup scheduler');
  stopBackupScheduler();
}

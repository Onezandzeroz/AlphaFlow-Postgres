/**
 * Backup Scheduler for AlphaAi Accounting
 *
 * Implements Danish Bookkeeping Law §15 compliance:
 * - Automated hourly/daily/weekly/monthly backups via cron
 * - First-data-triggered initial backup (fires when tenant first inputs data)
 * - Automatic retention cleanup per policy
 * - Per-tenant cron health monitoring (green/red light indicator)
 *
 * Architecture:
 * - Scheduler starts on Next.js server boot (via instrumentation.ts)
 * - Iterates all active companies with data on each schedule tick
 * - Each tenant's cron health is tracked independently
 * - Per-company dedup: skips if a backup of the same type already exists
 *   within the last N minutes (prevents rapid re-runs in dev)
 */

import cron, { type ScheduledTask } from 'node-cron';
import { db } from '@/lib/db';
import { runAutomaticBackup, cleanupExpiredBackups, BackupType } from '@/lib/backup-engine';
import { logger } from '@/lib/logger';

// ─── In-memory dedup tracking ───────────────────────────────────────────────
// Prevents creating duplicate backups of the same type within a cooldown window
// for the same company. Key = `${companyId}:${backupType}`
const LAST_AUTO_BACKUP: Map<string, number> = new Map();

// Cooldown periods (ms) per backup type – avoids hammering disk during dev restarts
const COOLDOWN_MS: Record<BackupType, number> = {
  hourly:  30 * 60 * 1000,   // 30 minutes
  daily:   22 * 60 * 1000,   // 22 hours
  weekly:  6  * 24 * 60 * 1000, // 6 days
  monthly: 28 * 24 * 60 * 1000, // 28 days
};

// Track which companies already received their first-data backup
// so we don't re-trigger on every subsequent write
const FIRST_BACKUP_DONE: Set<string> = new Set();

// ─── Per-Tenant Cron Health Monitoring ──────────────────────────────────────
// Each tenant (company) has its own set of cron health entries.
// Key = `${companyId}:${backupType}`

interface CronHealthEntry {
  type: BackupType;
  lastRunAt: string | null;
  lastStatus: 'success' | 'error' | 'never' | 'skipped';
  consecutiveErrors: number;
  errorMessage: string | null;
}

// Per-company health map: `${companyId}:${backupType}` → CronHealthEntry
const companyCronHealth: Map<string, CronHealthEntry> = new Map();

// Track which companies have been triggered by a first transaction
const TRIGGERED_COMPANIES: Set<string> = new Set();

/**
 * Get or create a cron health entry for a specific company + backup type.
 * Lazily created on first access.
 */
function getCompanyHealthEntry(companyId: string, type: BackupType): CronHealthEntry {
  const key = `${companyId}:${type}`;
  let entry = companyCronHealth.get(key);
  if (!entry) {
    entry = {
      type,
      lastRunAt: null,
      lastStatus: 'never',
      consecutiveErrors: 0,
      errorMessage: null,
    };
    companyCronHealth.set(key, entry);
  }
  return entry;
}

/**
 * Mark a company as triggered by its first transaction.
 * This transitions the company from "idle" to "pending" state.
 */
function markCompanyTriggered(companyId: string): void {
  TRIGGERED_COMPANIES.add(companyId);
}

function updateCompanyCronHealthSuccess(companyId: string, type: BackupType): void {
  const entry = getCompanyHealthEntry(companyId, type);
  entry.lastRunAt = new Date().toISOString();
  entry.lastStatus = 'success';
  entry.consecutiveErrors = 0;
  entry.errorMessage = null;
}

function updateCompanyCronHealthError(companyId: string, type: BackupType, error: string): void {
  const entry = getCompanyHealthEntry(companyId, type);
  entry.lastRunAt = new Date().toISOString();
  entry.lastStatus = 'error';
  entry.consecutiveErrors += 1;
  entry.errorMessage = error;
}

function updateCompanyCronHealthSkipped(companyId: string, type: BackupType): void {
  const entry = getCompanyHealthEntry(companyId, type);
  entry.lastRunAt = new Date().toISOString();
  entry.lastStatus = 'skipped';
}

/**
 * Get the cron health status for a SPECIFIC tenant (company).
 *
 * Four states:
 * - idle:      No transaction has occurred yet for this tenant.
 * - pending:   First transaction triggered initial backups, still in progress.
 * - healthy:   At least one backup succeeded, no errors.
 * - unhealthy: Scheduler has errors for this tenant.
 */
export function getCronHealth(companyId: string): {
  status: 'idle' | 'pending' | 'healthy' | 'unhealthy';
  entries: CronHealthEntry[];
  schedulerRunning: boolean;
  lastCheckedAt: string;
  summary: string;
} {
  const schedulerRunning = scheduledTasks.length > 0;

  // Get or create entries for all backup types for this company
  const entries = SCHEDULES.map((s) => getCompanyHealthEntry(companyId, s.type));

  let hasError = false;
  let errorMessages: string[] = [];

  for (const entry of entries) {
    if (entry.lastStatus === 'error') {
      hasError = true;
      if (entry.errorMessage) errorMessages.push(`${entry.type}: ${entry.errorMessage}`);
    }
  }

  const anyBackupSucceeded = entries.some((e) => e.lastStatus === 'success');

  // Determine state — each tenant is evaluated independently
  let status: 'idle' | 'pending' | 'healthy' | 'unhealthy';
  let summary: string;

  if (!TRIGGERED_COMPANIES.has(companyId)) {
    // This company has never had a transaction — idle
    status = 'idle';
    summary = 'Waiting for first transaction';
  } else if (hasError) {
    status = 'unhealthy';
    summary = `${errorMessages.length} schedule(s) with errors`;
  } else if (!anyBackupSucceeded) {
    // Triggered by transaction but backups still in progress
    status = 'pending';
    summary = 'Creating initial backups...';
  } else {
    status = 'healthy';
    summary = 'All schedules running normally';
  }

  return {
    status,
    entries,
    schedulerRunning,
    lastCheckedAt: new Date().toISOString(),
    summary,
  };
}

// ─── Cron expressions ───────────────────────────────────────────────────────
// These match the retention policy in backup-engine.ts

const SCHEDULES: { type: BackupType; cron: string; label: string }[] = [
  { type: 'hourly',  cron: '5 * * * *',       label: 'Hourly backup' },   // minute 5 every hour
  { type: 'daily',   cron: '15 2 * * *',       label: 'Daily backup' },    // 02:15 every day
  { type: 'weekly',  cron: '30 3 * * 1',       label: 'Weekly backup' },   // 03:30 every Monday
  { type: 'monthly', cron: '0 4 1 * *',        label: 'Monthly backup' },  // 04:00 on the 1st
];

// ─── Scheduled tasks (for cleanup on shutdown) ──────────────────────────────
const scheduledTasks: ScheduledTask[] = [];

/**
 * Get all active companies that have actual tenant data.
 * A company is considered to have data if it has any transactions,
 * journal entries, or invoices.
 */
async function getActiveCompaniesWithData(): Promise<{ userId: string; companyId: string }[]> {
  const companiesWithData = await db.$queryRaw<Array<{ userId: string; companyId: string }>>`
    SELECT DISTINCT uc."userId", uc."companyId"
    FROM "UserCompany" uc
    JOIN "Company" c ON c.id = uc."companyId"
    WHERE (
      EXISTS (SELECT 1 FROM "Transaction" t WHERE t."companyId" = uc."companyId" AND t."cancelled" = false LIMIT 1)
      OR EXISTS (SELECT 1 FROM "JournalEntry" je WHERE je."companyId" = uc."companyId" AND je."isDemo" = false LIMIT 1)
      OR EXISTS (SELECT 1 FROM "Invoice" i WHERE i."companyId" = uc."companyId" LIMIT 1)
    )
    AND uc."role" IN ('OWNER', 'ADMIN', 'EDITOR')
  `;

  return companiesWithData;
}

/**
 * Run scheduled backups for all companies with data.
 * Updates per-company cron health independently.
 * @param backupType - The type of backup to create
 * @param bypassCooldown - If true, ignore cooldown checks (used on startup)
 */
async function runScheduledBackupCycle(backupType: BackupType, bypassCooldown = false): Promise<void> {
  try {
    const companies = await getActiveCompaniesWithData();

    if (companies.length === 0) {
      logger.debug(`[BACKUP-SCHEDULER] ${backupType} cycle: no companies with data found`);
      return;
    }

    let totalSuccess = 0;
    let totalSkip = 0;
    let totalError = 0;

    for (const { userId, companyId } of companies) {
      // Dedup check: skip if we already backed up this company recently
      if (!bypassCooldown) {
        const key = `${companyId}:${backupType}`;
        const lastRun = LAST_AUTO_BACKUP.get(key) ?? 0;
        const cooldown = COOLDOWN_MS[backupType];

        if (Date.now() - lastRun < cooldown) {
          totalSkip++;
          continue;
        }
      }

      // Also skip if this company already has a completed backup of this type
      if (bypassCooldown) {
        const existingCount = await db.backup.count({
          where: { companyId, backupType, triggerType: 'automatic', status: 'completed' },
        });
        if (existingCount > 0) {
          totalSkip++;
          LAST_AUTO_BACKUP.set(`${companyId}:${backupType}`, Date.now());
          // Mark existing backups as success for this tenant's health
          updateCompanyCronHealthSuccess(companyId, backupType);
          continue;
        }
      }

      try {
        await runAutomaticBackup(userId, companyId, backupType);
        LAST_AUTO_BACKUP.set(`${companyId}:${backupType}`, Date.now());
        updateCompanyCronHealthSuccess(companyId, backupType);
        totalSuccess++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        updateCompanyCronHealthError(companyId, backupType, msg);
        totalError++;
        logger.error(`[BACKUP-SCHEDULER] Failed ${backupType} backup for company ${companyId}:`, error);
      }
    }

    logger.info(
      `[BACKUP-SCHEDULER] ${backupType} cycle complete: ${totalSuccess} backed up, ${totalSkip} skipped, ${totalError} errors`,
      { total: companies.length, success: totalSuccess, skipped: totalSkip, errors: totalError }
    );
  } catch (error) {
    logger.error(`[BACKUP-SCHEDULER] ${backupType} cycle error:`, error);
  }
}

/**
 * Start all backup cron schedules.
 * Called once from instrumentation.ts on server startup.
 */
export function startBackupScheduler(): void {
  if (process.env.DISABLE_BACKUP_SCHEDULER === 'true') {
    logger.info('[BACKUP-SCHEDULER] Disabled via DISABLE_BACKUP_SCHEDULER env');
    return;
  }

  logger.info('[BACKUP-SCHEDULER] Starting backup automation...');

  for (const { type, cron: cronExpr, label } of SCHEDULES) {
    if (!cron.validate(cronExpr)) {
      logger.error(`[BACKUP-SCHEDULER] Invalid cron expression for ${label}: ${cronExpr}`);
      continue;
    }

    const task = cron.schedule(cronExpr, () => {
      runScheduledBackupCycle(type);
    });

    scheduledTasks.push(task);
    logger.info(`[BACKUP-SCHEDULER] Scheduled "${label}" (${type}): ${cronExpr}`);
  }

  // Also run a full cleanup cycle daily at 03:00
  const cleanupTask = cron.schedule('0 3 * * *', async () => {
    try {
      const companies = await getActiveCompaniesWithData();
      let totalCleaned = 0;
      for (const { userId } of companies) {
        const n = await cleanupExpiredBackups(userId);
        totalCleaned += n;
      }
      if (totalCleaned > 0) {
        logger.info(`[BACKUP-SCHEDULER] Daily cleanup: removed ${totalCleaned} expired backups`);
      }
    } catch (error) {
      logger.error('[BACKUP-SCHEDULER] Daily cleanup error:', error);
    }
  });
  scheduledTasks.push(cleanupTask);

  logger.info(`[BACKUP-SCHEDULER] Active with ${scheduledTasks.length} scheduled tasks`);
}

/**
 * Stop all backup cron schedules.
 * Called on server shutdown.
 */
export function stopBackupScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  logger.info('[BACKUP-SCHEDULER] Stopped all scheduled tasks');
}

/**
 * Ensure the first automatic backup is created for a company
 * after its first data input (transaction, journal entry, or invoice).
 *
 * This is the "first tenant transaction" trigger:
 * - Fire-and-forget (non-blocking)
 * - Deduplicated: only runs once per company per server lifetime
 * - Creates ALL backup types (hourly, daily, weekly, monthly) as the initial baseline
 * - Also ensures the cron scheduler is started if not already running
 * - Updates per-company cron health independently
 *
 * Call this from data-mutating API routes (POST /transactions,
 * POST /journal-entries, POST /invoices, etc.)
 */
export function ensureInitialBackup(companyId: string, userId: string): void {
  if (FIRST_BACKUP_DONE.has(companyId)) {
    return;
  }
  FIRST_BACKUP_DONE.add(companyId);

  // Mark THIS specific company as triggered (idle → pending)
  markCompanyTriggered(companyId);

  // Ensure the global cron scheduler is running
  ensureSchedulerStarted();

  // Fire-and-forget — don't block the API response
  setImmediate(async () => {
    try {
      const [txCount, jeCount, invCount] = await Promise.all([
        db.transaction.count({ where: { companyId, cancelled: false } }),
        db.journalEntry.count({ where: { companyId, isDemo: false } }),
        db.invoice.count({ where: { companyId } }),
      ]);

      if (txCount + jeCount + invCount === 0) {
        logger.debug(`[BACKUP-SCHEDULER] Company ${companyId} has no data yet, skipping initial backup`);
        return;
      }

      logger.info(`[BACKUP-SCHEDULER] First data detected for company ${companyId} — creating initial backups (all types)`);
      let successCount = 0;
      for (const type of ['hourly', 'daily', 'weekly', 'monthly'] as BackupType[]) {
        try {
          const existingType = await db.backup.count({
            where: { companyId, backupType: type, triggerType: 'automatic', status: 'completed' },
          });
          if (existingType > 0) {
            logger.debug(`[BACKUP-SCHEDULER] Company ${companyId} already has ${type} backup, skipping`);
            LAST_AUTO_BACKUP.set(`${companyId}:${type}`, Date.now());
            updateCompanyCronHealthSuccess(companyId, type);
            successCount++;
            continue;
          }

          await runAutomaticBackup(userId, companyId, type);
          LAST_AUTO_BACKUP.set(`${companyId}:${type}`, Date.now());
          updateCompanyCronHealthSuccess(companyId, type);
          successCount++;
          logger.info(`[BACKUP-SCHEDULER] Initial ${type} backup succeeded for company ${companyId}`);
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          updateCompanyCronHealthError(companyId, type, msg);
          logger.error(`[BACKUP-SCHEDULER] Initial ${type} backup failed for company ${companyId}:`, error);
        }
      }
      logger.info(`[BACKUP-SCHEDULER] Initial backups complete for company ${companyId}: ${successCount}/4 succeeded`);
    } catch (error) {
      logger.error(`[BACKUP-SCHEDULER] Initial backup failed for company ${companyId}:`, error);
    }
  });
}

/**
 * Get the current scheduler status for display in the UI.
 */
export function getSchedulerStatus(): {
  running: boolean;
  tasksCount: number;
  firstBackupCompanies: number;
  schedules: { type: BackupType; cron: string; label: string; humanReadable: string }[];
} {
  return {
    running: scheduledTasks.length > 0,
    tasksCount: scheduledTasks.length,
    firstBackupCompanies: FIRST_BACKUP_DONE.size,
    schedules: SCHEDULES.map((s) => {
      let humanReadable: string;
      switch (s.type) {
        case 'hourly':  humanReadable = 'Hver time (minut 5)'; break;
        case 'daily':   humanReadable = 'Daglig kl. 02:15'; break;
        case 'weekly':  humanReadable = 'Ugentlig (mandag kl. 03:30)'; break;
        case 'monthly': humanReadable = 'Månedlig (1. kl. 04:00)'; break;
      }
      return { ...s, humanReadable };
    }),
  };
}

// ─── Lazy-start singleton ─────────────────────────────────────────────────
let _schedulerStarted = false;

/**
 * Ensure the backup scheduler has been started.
 * Safe to call multiple times — only starts once.
 * Used by ensureInitialBackup as a fallback when instrumentation isn't available.
 */
export function ensureSchedulerStarted(): void {
  if (_schedulerStarted) return;
  if (process.env.DISABLE_BACKUP_SCHEDULER === 'true') return;
  _schedulerStarted = true;
  startBackupScheduler();
}

/**
 * Instrumentation Hook (Next.js 16)
 *
 * Backup scheduler is started lazily from the first API request
 * (see src/lib/backup-scheduler.ts — ensureSchedulerStarted()).
 * This avoids webpack "Module not found: Can't resolve 'fs'" errors
 * that occur when instrumentation tries to statically import Node.js modules.
 */

export async function register() {
  // Backup scheduler starts lazily on first API request
}

export async function unregister() {
  // Cleanup handled by scheduler's own process exit handlers
}

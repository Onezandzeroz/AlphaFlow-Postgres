/**
 * Immutable Audit Trail System
 *
 * Required by Danish Bookkeeping Law §10-12:
 * All changes to accounting data must be logged immutably.
 * Entries can never be deleted or modified.
 *
 * Every CREATE, UPDATE, CANCEL, DELETE_ATTEMPT, LOGIN, LOGOUT action
 * is recorded with full before/after values.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'CANCEL'
  | 'DELETE_ATTEMPT'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'REGISTER'
  | 'BACKUP_CREATE'
  | 'BACKUP_RESTORE'
  | 'SESSION_INVALIDATE'
  | 'DATA_RESET'
  | 'OVERSIGHT';

export type EntityType =
  | 'User'
  | 'Transaction'
  | 'Invoice'
  | 'Company'
  | 'CompanyInfo'
  | 'Session'
  | 'Backup'
  | 'Account'
  | 'JournalEntry'
  | 'Contact'
  | 'FiscalPeriod'
  | 'BankStatement'
  | 'BankConnection'
  | 'Document'
  | 'RecurringEntry'
  | 'Budget'
  | 'YearEndClosing'
  | 'Invitation'
  | 'UserCompany'
  | 'System';

interface AuditOptions {
  action: AuditAction;
  entityType: EntityType;
  entityId: string;
  userId: string;
  companyId?: string | null;
  performedByUserId?: string | null;
  /** JSON object of changed fields: { field: { old, new } } */
  changes?: Record<string, { old: unknown; new: unknown }>;
  /** Additional metadata: IP, userAgent, etc. */
  metadata?: Record<string, unknown>;
}

/**
 * Log an audit event. This is the core function — all API routes
 * should call this for any data mutation.
 */
export async function auditLog(opts: AuditOptions): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: opts.userId,
        companyId: opts.companyId ?? null,
        performedByUserId: opts.performedByUserId ?? opts.userId,
        action: opts.action,
        entityType: opts.entityType,
        entityId: opts.entityId,
        changes: opts.changes ? JSON.stringify(opts.changes) : null,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
      },
    });
  } catch (error) {
    // Audit logging should never crash the application
    logger.error('[AUDIT] Failed to write audit log:', error);
  }
}

/**
 * Convenience: log a creation event
 */
export async function auditCreate(
  userId: string,
  entityType: EntityType,
  entityId: string,
  newData?: Record<string, unknown>,
  meta?: Record<string, unknown>,
  companyId?: string | null
): Promise<void> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  if (newData) {
    for (const [key, value] of Object.entries(newData)) {
      changes[key] = { old: null, new: value };
    }
  }
  return auditLog({ action: 'CREATE', entityType, entityId, userId, companyId, changes, metadata: meta });
}

/**
 * Convenience: log an update event with old and new values
 */
export async function auditUpdate(
  userId: string,
  entityType: EntityType,
  entityId: string,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  meta?: Record<string, unknown>,
  companyId?: string | null
): Promise<void> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(newData)) {
    if (newData[key] !== oldData[key]) {
      changes[key] = { old: oldData[key], new: newData[key] };
    }
  }
  if (Object.keys(changes).length > 0) {
    return auditLog({ action: 'UPDATE', entityType, entityId, userId, companyId, changes, metadata: meta });
  }
}

/**
 * Convenience: log a cancellation (soft-delete) event
 */
export async function auditCancel(
  userId: string,
  entityType: EntityType,
  entityId: string,
  reason?: string,
  meta?: Record<string, unknown>,
  companyId?: string | null
): Promise<void> {
  return auditLog({
    action: 'CANCEL',
    entityType,
    entityId,
    userId,
    companyId,
    metadata: { reason, ...meta },
  });
}

/**
 * Convenience: log a delete attempt (for audit compliance — actual data is preserved)
 */
export async function auditDeleteAttempt(
  userId: string,
  entityType: EntityType,
  entityId: string,
  meta?: Record<string, unknown>,
  companyId?: string | null
): Promise<void> {
  return auditLog({ action: 'DELETE_ATTEMPT', entityType, entityId, userId, companyId, metadata: meta });
}

/**
 * Convenience: log authentication events
 */
export async function auditAuth(
  userId: string,
  action: 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'REGISTER',
  meta?: Record<string, unknown>,
  companyId?: string | null
): Promise<void> {
  return auditLog({
    action,
    entityType: 'User',
    entityId: userId,
    userId,
    companyId,
    metadata: meta,
  });
}

/**
 * Build metadata object from a Request
 */
export function requestMetadata(request: Request): Record<string, unknown> {
  return {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null,
    userAgent: request.headers.get('user-agent') || null,
    timestamp: new Date().toISOString(),
  };
}

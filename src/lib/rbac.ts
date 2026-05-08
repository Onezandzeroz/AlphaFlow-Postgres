/**
 * Role-Based Access Control (RBAC) for AlphaAi Accounting
 *
 * Multi-tenant permission system with role hierarchy:
 *   OWNER(5) > ADMIN(4) > ACCOUNTANT(3) > VIEWER(2) > AUDITOR(1)
 *
 * SUPER_DEV users get read-only cross-tenant access to specific permissions.
 */

import { CompanyRole } from '@prisma/client';
import { NextResponse } from 'next/server';

// ─── AUTH CONTEXT ────────────────────────────────────────────────────
// Defined inline here; consolidated export from session.ts

export interface AuthContext {
  id: string;
  email: string;
  businessName?: string | null;
  isSuperDev: boolean;
  activeCompanyId: string | null;
  activeCompanyRole: string | null; // CompanyRole as string
  activeCompanyName: string | null;
  demoModeEnabled: boolean;
  /** True when the active company is the shared demo company — all writes must be blocked */
  isDemoCompany: boolean;
  /** When set, this SuperDev user is overseeing another tenant in read-only mode */
  oversightCompanyId: string | null;
  oversightCompanyName: string | null;
  /** True when oversightCompanyId is set — all mutations must be blocked */
  isOversightMode: boolean;
}

// ─── ROLE HIERARCHY ──────────────────────────────────────────────────

const ROLE_LEVEL: Record<CompanyRole, number> = {
  OWNER: 5,
  ADMIN: 4,
  ACCOUNTANT: 3,
  VIEWER: 2,
  AUDITOR: 1,
};

/**
 * Get the numeric level for a role string.
 * Returns 0 for unknown/invalid roles.
 */
export function getRoleLevel(role: string | null): number {
  if (!role) return 0;
  return ROLE_LEVEL[role as CompanyRole] ?? 0;
}

// ─── PERMISSION DEFINITIONS ──────────────────────────────────────────

export enum Permission {
  // Company settings
  COMPANY_VIEW_SETTINGS = 'COMPANY_VIEW_SETTINGS',
  COMPANY_EDIT_SETTINGS = 'COMPANY_EDIT_SETTINGS',
  COMPANY_TRANSFER_OWNERSHIP = 'COMPANY_TRANSFER_OWNERSHIP',
  COMPANY_DELETE = 'COMPANY_DELETE',

  // Member management
  MEMBERS_VIEW = 'MEMBERS_VIEW',
  MEMBERS_INVITE = 'MEMBERS_INVITE',
  MEMBERS_REMOVE = 'MEMBERS_REMOVE',
  MEMBERS_CHANGE_ROLE = 'MEMBERS_CHANGE_ROLE',

  // Accounting data
  DATA_READ = 'DATA_READ',
  DATA_CREATE = 'DATA_CREATE',
  DATA_EDIT = 'DATA_EDIT',
  DATA_CANCEL = 'DATA_CANCEL',
  DATA_DELETE = 'DATA_DELETE',

  // Reports
  REPORTS_VIEW = 'REPORTS_VIEW',
  REPORTS_EXPORT = 'REPORTS_EXPORT',
  REPORTS_SAFT = 'REPORTS_SAFT',

  // Period management
  PERIOD_CLOSE = 'PERIOD_CLOSE',
  PERIOD_OPEN = 'PERIOD_OPEN',
  YEAR_END_CLOSE = 'YEAR_END_CLOSE',

  // Banking
  BANK_CONNECT = 'BANK_CONNECT',
  BANK_SYNC = 'BANK_SYNC',

  // Backup
  BACKUP_CREATE = 'BACKUP_CREATE',
  BACKUP_RESTORE = 'BACKUP_RESTORE',
}

/**
 * Minimum role required for each permission.
 */
const PERMISSION_MIN_ROLE: Record<Permission, CompanyRole> = {
  [Permission.COMPANY_VIEW_SETTINGS]: CompanyRole.VIEWER,
  [Permission.COMPANY_EDIT_SETTINGS]: CompanyRole.ADMIN,
  [Permission.COMPANY_TRANSFER_OWNERSHIP]: CompanyRole.OWNER,
  [Permission.COMPANY_DELETE]: CompanyRole.OWNER,

  [Permission.MEMBERS_VIEW]: CompanyRole.ADMIN,
  [Permission.MEMBERS_INVITE]: CompanyRole.ADMIN,
  [Permission.MEMBERS_REMOVE]: CompanyRole.ADMIN,
  [Permission.MEMBERS_CHANGE_ROLE]: CompanyRole.OWNER,

  [Permission.DATA_READ]: CompanyRole.VIEWER,
  [Permission.DATA_CREATE]: CompanyRole.ACCOUNTANT,
  [Permission.DATA_EDIT]: CompanyRole.ACCOUNTANT,
  [Permission.DATA_CANCEL]: CompanyRole.ACCOUNTANT,
  [Permission.DATA_DELETE]: CompanyRole.ADMIN,

  [Permission.REPORTS_VIEW]: CompanyRole.VIEWER,
  [Permission.REPORTS_EXPORT]: CompanyRole.AUDITOR,
  [Permission.REPORTS_SAFT]: CompanyRole.ACCOUNTANT,

  [Permission.PERIOD_CLOSE]: CompanyRole.ACCOUNTANT,
  [Permission.PERIOD_OPEN]: CompanyRole.ADMIN,
  [Permission.YEAR_END_CLOSE]: CompanyRole.ADMIN,

  [Permission.BANK_CONNECT]: CompanyRole.ADMIN,
  [Permission.BANK_SYNC]: CompanyRole.ACCOUNTANT,

  [Permission.BACKUP_CREATE]: CompanyRole.ADMIN,
  [Permission.BACKUP_RESTORE]: CompanyRole.OWNER,
};

/**
 * Permissions that SUPER_DEV users can access (read-only cross-tenant).
 */
const SUPER_DEV_READ_PERMISSIONS: ReadonlySet<Permission> = new Set([
  Permission.COMPANY_VIEW_SETTINGS,
  Permission.DATA_READ,
  Permission.REPORTS_VIEW,
  Permission.REPORTS_EXPORT,
  Permission.MEMBERS_VIEW,
]);

// ─── PERMISSION CHECK ────────────────────────────────────────────────

/**
 * Check if an AuthContext has a specific permission.
 *
 * Rules:
 * - SUPER_DEV in oversight mode: read-only access (SUPER_DEV_READ_PERMISSIONS only)
 * - SUPER_DEV in own company: full OWNER permissions
 * - Other users: their activeCompanyRole must meet the minimum role level
 * - Users with no active company get no permissions (except SUPER_DEV with read)
 *
 * @returns true if the permission is granted
 */
export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  // SUPER_DEV in oversight mode: read-only cross-tenant access
  if (ctx.isSuperDev && ctx.isOversightMode) {
    return SUPER_DEV_READ_PERMISSIONS.has(permission);
  }

  // SUPER_DEV in own company: full OWNER permissions
  if (ctx.isSuperDev) {
    return true;
  }

  // Users without an active company role cannot perform any action
  if (!ctx.activeCompanyRole) {
    return false;
  }

  const minRole = PERMISSION_MIN_ROLE[permission];
  const userLevel = getRoleLevel(ctx.activeCompanyRole);
  const requiredLevel = ROLE_LEVEL[minRole];

  return userLevel >= requiredLevel;
}

// ─── REQUIRE PERMISSION (for API routes) ─────────────────────────────

/**
 * Require a permission in an API route.
 *
 * @returns null if permission is granted, or a NextResponse (403/400) if denied.
 *
 * Usage:
 * ```ts
 * const denied = requirePermission(ctx, Permission.DATA_CREATE);
 * if (denied) return denied;
 * ```
 */
export function requirePermission(
  ctx: AuthContext | null,
  permission: Permission
): NextResponse | null {
  // No auth context at all
  if (!ctx) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // No active company (unless SUPER_DEV with read permission)
  if (!ctx.activeCompanyId && !ctx.isSuperDev) {
    return NextResponse.json(
      { error: 'No active company selected. Please select a company.' },
      { status: 400 }
    );
  }

  // Block write permissions on the shared demo company
  // (AppOwner/SuperDev is allowed to edit demo company data)
  if (ctx.isDemoCompany && !ctx.isSuperDev && !isReadPermission(permission)) {
    return NextResponse.json(
      {
        error: 'Read-only mode: Cannot modify data in the demo company',
        code: 'DEMO_COMPANY_READ_ONLY',
      },
      { status: 403 }
    );
  }

  if (!hasPermission(ctx, permission)) {
    return NextResponse.json(
      {
        error: 'Insufficient permissions',
        required: permission,
        yourRole: ctx.activeCompanyRole ?? 'none',
      },
      { status: 403 }
    );
  }

  return null;
}

/**
 * Check if a permission is read-only (does not modify data).
 * Used to determine if the permission should be allowed in demo company context.
 */
function isReadPermission(permission: Permission): boolean {
  return [
    Permission.COMPANY_VIEW_SETTINGS,
    Permission.DATA_READ,
    Permission.REPORTS_VIEW,
    Permission.REPORTS_EXPORT,
    Permission.MEMBERS_VIEW,
  ].includes(permission);
}

// ─── COMPANY SCOPE ───────────────────────────────────────────────────

/**
 * Get the company scoping filter for Prisma queries.
 *
 * - Oversight mode: `{ companyId: <oversightCompanyId> }` (read-only access to overseen tenant)
 * - SUPER_DEV (normal): `{ companyId: <activeCompanyId> }` (sees own company only)
 * - Normal users: `{ companyId: <activeCompanyId> }`
 * - No company: `{ companyId: '__none__' }` (sees nothing)
 *
 * NOTE: The oversight tenants list API (`/api/oversight/tenants`) bypasses this
 * function and queries `db.company.findMany()` directly, so it can still list
 * all companies for the oversight selector.
 */
export function companyScope(
  ctx: AuthContext
): { companyId: string } | Record<string, never> {
  // Oversight mode: scope to the overseen tenant
  if (ctx.isOversightMode && ctx.oversightCompanyId) {
    return { companyId: ctx.oversightCompanyId };
  }

  // SUPER_DEV in normal mode: sees own company only (not all companies!)
  // They switch to other tenants via the oversight flow.
  if (ctx.isSuperDev && ctx.activeCompanyId) {
    return { companyId: ctx.activeCompanyId };
  }

  // User with active company
  if (ctx.activeCompanyId) {
    return { companyId: ctx.activeCompanyId };
  }

  // User with no company — matches nothing
  return { companyId: '__none__' };
}

// ─── TENANT FILTER ───────────────────────────────────────────────────

/**
 * Combined tenant + demo filter for Prisma queries.
 *
 * Merges:
 *   1. companyScope() — tenant isolation (or oversight scope)
 *   2. demo mode filter — isDemo: true/false based on user preference
 *
 * When in oversight mode (isOversightMode + oversightCompanyId):
 *   - Uses the oversightCompanyId as the company filter (sees all data, including demo)
 *   - No demo filter applied (oversight sees everything)
 *
 * For SUPER_DEV in normal mode:
 *   - Uses activeCompanyId (own company only)
 *   - Demo filter applied normally
 *
 * Usage:
 * ```ts
 * const where = tenantFilter(ctx);
 * const transactions = await db.transaction.findMany({ where });
 * ```
 */
export function tenantFilter(
  ctx: AuthContext
): Record<string, unknown> {
  // Oversight mode: scope to the overseen tenant, no demo filter (see everything)
  if (ctx.isOversightMode && ctx.oversightCompanyId) {
    return { companyId: ctx.oversightCompanyId };
  }

  // New model: company context switching handles demo vs live.
  // When user is in the demo company, companyScope() returns the demo company's ID.
  // No need for isDemo filter — all data in the active company is visible.
  return companyScope(ctx);
}

// ─── OVERSIGHT MUTATION BLOCK ───────────────────────────────────────

/**
 * Block any data mutation when the user is in oversight (read-only) mode.
 *
 * Usage in every mutation API route (POST, PUT, DELETE, PATCH):
 * ```ts
 * const oversightBlocked = blockOversightMutation(ctx);
 * if (oversightBlocked) return oversightBlocked;
 * ```
 *
 * @returns null if mutations are allowed, or a 403 NextResponse if blocked.
 */
export function blockOversightMutation(
  ctx: AuthContext | null
): NextResponse | null {
  if (!ctx) return null; // Let requirePermission handle unauthenticated

  if (ctx.isOversightMode) {
    return NextResponse.json(
      {
        error: 'Read-only mode: Cannot modify data while overseeing another tenant',
        code: 'OVERSIGHT_READ_ONLY',
      },
      { status: 403 }
    );
  }

  return null;
}

// ─── DEMO COMPANY MUTATION BLOCK ────────────────────────────────────

/**
 * Block any data mutation when the user is in the shared demo company.
 *
 * This is an additional safety net beyond requirePermission().
 * Use in every mutation API route (POST, PUT, DELETE, PATCH):
 * ```ts
 * const demoBlocked = requireNotDemoCompany(ctx);
 * if (demoBlocked) return demoBlocked;
 * ```
 *
 * @returns null if mutations are allowed, or a 403 NextResponse if blocked.
 */
export function requireNotDemoCompany(
  ctx: AuthContext | null
): NextResponse | null {
  if (!ctx) return null; // Let requirePermission handle unauthenticated

  // AppOwner/SuperDev is allowed to edit demo company data
  if (ctx.isDemoCompany && !ctx.isSuperDev) {
    return NextResponse.json(
      {
        error: 'Read-only mode: Cannot modify data in the demo company',
        code: 'DEMO_COMPANY_READ_ONLY',
      },
      { status: 403 }
    );
  }

  return null;
}

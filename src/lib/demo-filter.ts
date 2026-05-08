/**
 * Demo mode filter — re-exports from rbac for backward compatibility.
 *
 * The new multi-tenant architecture uses `tenantFilter(ctx)` from `@/lib/rbac`
 * which combines company scoping + demo mode filtering.
 *
 * This module is kept for backward compatibility with any code that still
 * imports from `@/lib/demo-filter`.
 */

import { db } from '@/lib/db';
import type { AuthContext } from '@/lib/rbac';

/**
 * Get the demo mode filter for queries based on user's demo mode status.
 * - In demo mode: only show isDemo: true records
 * - In live mode: only show isDemo: false records
 *
 * @deprecated Use `tenantFilter(ctx)` from `@/lib/rbac` instead.
 */
export async function getDemoFilter(userId: string): Promise<{ isDemo: boolean }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { demoModeEnabled: true },
  });

  return { isDemo: user?.demoModeEnabled ?? false };
}

/**
 * Apply demo filter to a Prisma where clause
 *
 * @deprecated Use `tenantFilter(ctx)` from `@/lib/rbac` instead.
 */
export function applyDemoFilter<T extends Record<string, any>>(
  baseWhere: T,
  demoFilter: { isDemo: boolean }
): T & { isDemo: boolean } {
  return { ...baseWhere, isDemo: demoFilter.isDemo };
}

/**
 * Get demo filter from an AuthContext (no DB query needed).
 * This is the preferred way when you already have an AuthContext.
 */
export function getDemoFilterFromContext(ctx: AuthContext): { isDemo: boolean } {
  return { isDemo: ctx.demoModeEnabled };
}

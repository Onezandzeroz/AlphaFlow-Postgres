/**
 * Secure session management with multi-tenant AuthContext
 *
 * Features:
 * - Cryptographically secure random session tokens
 * - Session validation against database
 * - Automatic expiry (7 days default, sliding)
 * - Session invalidation on logout
 * - Multi-tenant AuthContext with active company & role
 */

import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'session';
const SESSION_MAX_AGE_DAYS = 7;

// ─── AUTH CONTEXT ────────────────────────────────────────────────────

export interface AuthContext {
  id: string;
  email: string;
  emailVerified: boolean;
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

// ─── TOKEN GENERATION ────────────────────────────────────────────────

/**
 * Generate a cryptographically secure session token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── CREATE SESSION ──────────────────────────────────────────────────

/**
 * Create a new session for a user and set the cookie.
 *
 * Auto-sets activeCompanyId from the user's first company
 * (ordered by joinedAt ascending).
 */
export async function createSession(
  userId: string,
  request?: Request
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);

  // Extract IP and user agent if available
  const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || null;
  const userAgent = request?.headers.get('user-agent') || null;

  // Auto-set activeCompanyId: pick the user's first company (by joinedAt)
  const firstCompany = await db.userCompany.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: { companyId: true },
  });

  await db.session.create({
    data: {
      token,
      userId,
      activeCompanyId: firstCompany?.companyId ?? null,
      ipAddress,
      userAgent,
      expiresAt,
    },
  });

  return token;
}

// ─── GET AUTH CONTEXT ────────────────────────────────────────────────

/**
 * Get the full AuthContext for the current request.
 *
 * This is the primary authentication function for API routes.
 * It resolves:
 *   - User identity (id, email, businessName)
 *   - Super-dev status
 *   - Active company (id, name, role)
 *   - Demo mode flag
 *
 * Returns null if not authenticated (no session cookie, expired, etc.)
 */
export async function getAuthContext(request?: Request): Promise<AuthContext | null> {
  let token: string | undefined;

  // Try to get token from cookie first, then from Authorization header
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  } catch {
    // cookies() throws in some edge runtime contexts; fall through to header
  }

  if (!token && request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) return null;

  // Find valid session with user + activeCompany + oversightCompany
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          emailVerified: true,
          businessName: true,
          isSuperDev: true,
          demoModeEnabled: true,
        },
      },
      activeCompany: {
        select: {
          id: true,
          name: true,
          isDemo: true,
        },
      },
      oversightCompany: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!session) return null;

  // Check if session expired
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }

  // Sliding expiry: extend session on each use
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_MAX_AGE_DAYS);
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: newExpiresAt },
  });

  // Determine the user's role in the active company
  let activeCompanyRole: string | null = null;

  if (session.activeCompanyId && !session.user.isSuperDev) {
    const userCompany = await db.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: session.userId,
          companyId: session.activeCompanyId,
        },
      },
      select: { role: true },
    });
    activeCompanyRole = userCompany?.role ?? null;
  } else if (session.user.isSuperDev) {
    // SUPER_DEV implicitly has OWNER-level access for read operations
    // (The RBAC module handles the actual permission check)
    activeCompanyRole = 'OWNER';
  }

  // SuperDev (AppOwner / AlphaAi) is ALWAYS treated as verified
  const effectiveEmailVerified = session.user.isSuperDev ? true : (session.user.emailVerified ?? false);

  return {
    id: session.user.id,
    email: session.user.email,
    emailVerified: effectiveEmailVerified,
    businessName: session.user.businessName,
    isSuperDev: session.user.isSuperDev,
    activeCompanyId: session.activeCompanyId,
    activeCompanyRole,
    activeCompanyName: session.activeCompany?.name ?? null,
    demoModeEnabled: session.user.demoModeEnabled,
    isDemoCompany: session.activeCompany?.isDemo ?? false,
    oversightCompanyId: session.oversightCompanyId,
    oversightCompanyName: session.oversightCompany?.name ?? null,
    isOversightMode: session.oversightCompanyId !== null,
  };
}

// ─── GET AUTH USER (backwards-compatible wrapper) ────────────────────

/**
 * Get the current authenticated user from session.
 * Backwards-compatible wrapper around getAuthContext.
 *
 * Returns null if not authenticated.
 */
export async function getAuthUser(
  request?: Request
): Promise<{ id: string; email: string; businessName?: string | null } | null> {
  const ctx = await getAuthContext(request);
  if (!ctx) return null;

  return {
    id: ctx.id,
    email: ctx.email,
    businessName: ctx.businessName,
  };
}

// ─── SESSION MANAGEMENT ──────────────────────────────────────────────

/**
 * Delete a session (logout)
 */
export async function destroySession(token?: string): Promise<void> {
  const cookieStore = await cookies();
  const sessionToken = token || cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    await db.session.deleteMany({ where: { token: sessionToken } });
  }
}

/**
 * Delete all sessions for a user (e.g., password change)
 */
export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

/**
 * Clean up expired sessions (call periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const result = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

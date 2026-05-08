# Multi-Tenant RBAC Implementation Plan
## AlphaAi Accounting — Single-Tenant → Multi-Tenant Conversion

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prisma Schema Changes](#2-prisma-schema-changes)
3. [Auth Session Changes](#3-auth-session-changes)
4. [RBAC Permission Matrix](#4-rbac-permission-matrix)
5. [Prioritized Implementation Order](#5-prioritized-implementation-order)
6. [Data Migration Strategy](#6-data-migration-strategy)
7. [Frontend Changes Summary](#7-frontend-changes-summary)

---

## 1. Architecture Overview

### Current State
```
User (1) ──owns──> (N) Transactions, Invoices, Accounts, etc.
     Every query: WHERE userId = currentUserId
```

### Target State
```
User (M) ──belongs to──> (N) Company  (via UserCompany junction)
Company (1) ──owns──> (N) Transactions, Invoices, Accounts, etc.
     Every query: WHERE companyId = activeCompanyId
     Every mutation: CHECK role has permission
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| CompanyInfo → Company? | **MERGE** | CompanyInfo IS the company. Having both creates confusion. All CompanyInfo fields move into the new `Company` model. The old `CompanyInfo` model is deleted. |
| Where to store active companyId? | **On Session model** (`activeCompanyId` field) | No extra cookies needed. Session already validated on every request. Single source of truth. User gets one active company per session. |
| SUPER_DEV implementation? | **`isSuperDev` boolean on User** | Simplest approach. No special auth flow. Flag checked in middleware. SUPER_DEV bypasses company-scoping but is read-only everywhere. |
| userId on company-scoped models? | **Keep during migration, remove after** | Two-phase: Phase A adds `companyId` alongside `userId`. Phase B (post-migration cleanup) removes `userId` from company-scoped models. |
| Company selector UX location? | **Top of sidebar, below logo** | Natural placement. Single-company users see just the name (no dropdown). Multi-company users get a dropdown. |

---

## 2. Prisma Schema Changes

### 2A. New Enums

```prisma
// ─── MULTI-TENANT: Roles ──────────────────────────────────────────

enum CompanyRole {
  OWNER        // Full control + can transfer ownership, manage members
  ADMIN        // Full control except ownership transfer and member removal of OWNER
  ACCOUNTANT   // Can create/edit all accounting data, cannot manage members or settings
  VIEWER       // Read-only access to all accounting data
  AUDITOR      // Read-only + can export reports and run audits, cannot see member management
}

enum InvitationStatus {
  PENDING      // Invitation sent, not yet accepted
  ACCEPTED     // User accepted and joined the company
  EXPIRED      // Invitation token expired (7 days)
  REVOKED      // Owner/Admin revoked the invitation
}
```

### 2B. New Models

```prisma
// ─── MULTI-TENANT: Company (Tenant Entity) ────────────────────────
// Replaces the old CompanyInfo model. This IS the tenant boundary.

model Company {
  id                   String   @id @default(cuid())
  name                 String   // Company display name (was: companyName in CompanyInfo)
  logo                 String?  // Base64 or URL
  
  // Business registration (from CompanyInfo)
  address              String
  phone                String
  email                String
  cvrNumber            String   // Danish business registration number
  companyType          String?  // ApS, A/S, IVS, Enkeltmandsvirksomhed, etc.
  
  // Invoice settings (from CompanyInfo)
  invoicePrefix        String
  invoiceTerms         String?
  invoiceNotesTemplate String?
  nextInvoiceSequence  Int      @default(1)
  currentYear          Int      @default(2025)
  
  // Bank details (from CompanyInfo)
  bankName             String
  bankAccount          String
  bankRegistration     String
  bankIban             String?
  bankStreet           String?
  bankCity             String?
  bankCountry          String?
  
  // Meta
  isDemo               Boolean  @default(false)
  isActive             Boolean  @default(true)  // Soft-delete for companies
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  
  // Relations
  members              UserCompany[]
  invitations          Invitation[]
  transactions         Transaction[]
  invoices             Invoice[]
  accounts             Account[]
  journalEntries       JournalEntry[]
  contacts             Contact[]
  fiscalPeriods        FiscalPeriod[]
  bankStatements       BankStatement[]
  bankConnections      BankConnection[]
  recurringEntries     RecurringEntry[]
  budgets              Budget[]
  backups              Backup[]
  auditLogs            AuditLog[]
  
  @@unique([cvrNumber, isDemo])  // Prevent duplicate CVR within same demo/live scope
  @@index([isActive])
  @@index([cvrNumber])
}

// ─── MULTI-TENANT: User-Company Junction ──────────────────────────

model UserCompany {
  id        String      @id @default(cuid())
  userId    String
  companyId String
  role      CompanyRole @default(VIEWER)
  joinedAt  DateTime    @default(now())
  
  // Who invited this user (null for original owner/migration)
  invitedBy String?
  
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  company   Company     @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@unique([userId, companyId])  // A user can only have one role per company
  @@index([userId])
  @@index([companyId])
  @@index([role])
}

// ─── MULTI-TENANT: Invitation System ──────────────────────────────

model Invitation {
  id          String           @id @default(cuid())
  companyId   String
  email       String           // Invitee email (lowercased, trimmed)
  role        CompanyRole      @default(VIEWER)
  token       String           @unique  // Cryptographic token for acceptance
  status      InvitationStatus @default(PENDING)
  invitedBy   String           // userId of the inviter
  expiresAt   DateTime         // 7 days from creation
  acceptedAt  DateTime?
  acceptedBy  String?          // userId who accepted (may differ if email mismatch)
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  
  company     Company          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@index([email, status])
  @@index([companyId, status])
  @@index([token])
  @@index([expiresAt])
}
```

### 2C. Modified Models

#### User Model — Add `isSuperDev` and new relations

```prisma
model User {
  id               String             @id @default(cuid())
  email            String             @unique
  password         String             // bcrypt hash
  businessName     String?            // Kept for backwards compat during transition
  sidebarPrefs     String?            // JSON
  userPrefs        String?            // JSON
  demoModeEnabled  Boolean            @default(false)
  
  // ─── NEW: Multi-tenant fields ───
  isSuperDev       Boolean            @default(false)  // AlphaAi SUPER_DEV read-only cross-tenant access
  
  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt
  
  // Existing relations (kept during migration, some removed in Phase B)
  transactions     Transaction[]
  invoices         Invoice[]
  companyInfos     CompanyInfo[]      // REMOVED in Phase B after migration
  sessions         Session[]
  auditLogs        AuditLog[]
  backups          Backup[]
  accounts         Account[]
  journalEntries   JournalEntry[]
  contacts         Contact[]
  fiscalPeriods    FiscalPeriod[]
  bankStatements   BankStatement[]
  bankConnections  BankConnection[]
  recurringEntries RecurringEntry[]
  budgets          Budget[]
  
  // ─── NEW: Multi-tenant relations ───
  companies        UserCompany[]      // Companies this user belongs to
  performedAuditLogs AuditLog[]       @relation("PerformedByUser") // Audit logs where this user performed the action
}
```

#### Session Model — Add `activeCompanyId`

```prisma
model Session {
  id              String    @id @default(cuid())
  token           String    @unique
  userId          String
  activeCompanyId String?   // ─── NEW: Currently active company for this session
  ipAddress       String?
  userAgent       String?
  expiresAt       DateTime
  createdAt       DateTime  @default(now())
  
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  activeCompany   Company?  @relation(fields: [activeCompanyId], references: [id], onDelete: SetNull)
  
  @@index([token])
  @@index([userId])
  @@index([expiresAt])
  @@index([activeCompanyId])
}
```

#### AuditLog Model — Add `companyId` and `performedByUserId`

```prisma
model AuditLog {
  id               String   @id @default(cuid())
  userId           String   // Keep: for backwards compat + SUPER_DEV identification
  companyId        String?  // ─── NEW: Which company this action was performed in
  performedByUserId String? // ─── NEW: Who actually performed the action (may differ from userId in SUPER_DEV case)
  action           String
  entityType       String
  entityId         String
  changes          String?
  metadata         String?
  createdAt        DateTime @default(now())
  
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  company          Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)
  performedByUser  User?    @relation("PerformedByUser", fields: [performedByUserId], references: [id], onDelete: SetNull)
  
  @@index([userId])
  @@index([companyId])       // ─── NEW
  @@index([entityType, entityId])
  @@index([action])
  @@index([createdAt])
  @@index([performedByUserId]) // ─── NEW
}
```

#### All Company-Scoped Models — Add `companyId`

Each of these models gets a new `companyId` field and relation. The `userId` field is **kept temporarily** for migration safety but will be removed in Phase B.

**Transaction:**
```prisma
model Transaction {
  // ... existing fields unchanged ...
  
  userId          String   // KEPT during migration (Phase B: removed)
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  // NEW indexes:
  @@index([companyId])        // Primary query path
  @@index([companyId, date])  // Date-range queries scoped to company
  @@index([companyId, isDemo])
}
```

**Invoice:**
```prisma
model Invoice {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@unique([companyId, invoiceNumber])  // Was: [userId, invoiceNumber]
  @@index([companyId])
  @@index([companyId, status])
}
```

**Account:**
```prisma
model Account {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@unique([companyId, number, isDemo])  // Was: [userId, number, isDemo]
  @@index([companyId, type])
  @@index([companyId, group])
  @@index([companyId, isDemo])
  @@index([companyId])
}
```

**JournalEntry:**
```prisma
model JournalEntry {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@index([companyId, date])
  @@index([companyId, status])
  @@index([companyId])
}
```

**Contact:**
```prisma
model Contact {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@index([companyId, type])
  @@index([companyId, cvrNumber])
  @@index([companyId])
}
```

**FiscalPeriod:**
```prisma
model FiscalPeriod {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@unique([companyId, year, month, isDemo])  // Was: [userId, year, month, isDemo]
  @@index([companyId, year])
  @@index([companyId, status])
  @@index([companyId])
}
```

**BankStatement:**
```prisma
model BankStatement {
  // ... existing fields unchanged ...
  
  userId           String
  user             User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId        String       // ─── NEW
  company          Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@index([companyId, bankAccount])
  @@index([companyId, startDate])
  @@index([companyId, isDemo])
  @@index([companyId])
}
```

**BankConnection:**
```prisma
model BankConnection {
  // ... existing fields unchanged ...
  
  userId           String
  user             User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId        String       // ─── NEW
  company          Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@unique([companyId, accountNumber, isDemo])  // Was: [userId, accountNumber, isDemo]
  @@index([companyId, status])
  @@index([companyId, provider])
  @@index([companyId])
}
```

**RecurringEntry:**
```prisma
model RecurringEntry {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@index([companyId, status])
  @@index([companyId, nextExecution])
  @@index([companyId])
}
```

**Budget:**
```prisma
model Budget {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@unique([companyId, year, isDemo])  // Was: [userId, year, isDemo]
  @@index([companyId])
}
```

**Backup:**
```prisma
model Backup {
  // ... existing fields unchanged ...
  
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  companyId       String   // ─── NEW
  company         Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  
  @@index([companyId])
  @@index([companyId, backupType])
  @@index([companyId, createdAt])
}
```

### 2D. CompanyInfo Model — REMOVED after migration

The `CompanyInfo` model is deleted. All its fields are absorbed into `Company`. The migration script handles the data transfer.

### 2E. Models That Do NOT Get `companyId`

| Model | Reason |
|---|---|
| `User` | Global entity, not company-scoped |
| `Session` | Has `activeCompanyId` (not `companyId`), represents user's login state |
| `UserCompany` | Junction table, already has `companyId` |
| `Invitation` | Already has `companyId` |
| `JournalEntryLine` | Implicitly scoped via its parent `JournalEntry` |
| `BankStatementLine` | Implicitly scoped via its parent `BankStatement` |
| `BankConnectionSync` | Implicitly scoped via its parent `BankConnection` |
| `BudgetEntry` | Implicitly scoped via its parent `Budget` |
| `Document` | Implicitly scoped via its parent `JournalEntry` |

---

## 3. Auth Session Changes

### 3A. New Return Type for `getAuthContext()`

```typescript
// src/lib/session.ts

export interface AuthContext {
  id: string;               // User ID
  email: string;
  businessName?: string | null;
  isSuperDev: boolean;      // NEW
  
  // Active company context
  activeCompanyId: string | null;   // NEW: null if user has no companies yet
  activeCompanyRole: CompanyRole | null;  // NEW: user's role in active company
  activeCompanyName: string | null;       // NEW: for frontend display
  
  // Demo mode (moved from separate DB query)
  demoModeEnabled: boolean;
}

export async function getAuthContext(request?: Request): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  
  if (!token) return null;
  
  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          businessName: true,
          isSuperDev: true,
          demoModeEnabled: true,
        },
      },
      activeCompany: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }
  
  // Sliding expiry
  const newExpiresAt = new Date();
  newExpiresAt.setDate(newExpiresAt.getDate() + SESSION_MAX_AGE_DAYS);
  await db.session.update({
    where: { id: session.id },
    data: { expiresAt: newExpiresAt },
  });
  
  // Determine role in active company
  let activeCompanyRole: CompanyRole | null = null;
  if (session.activeCompanyId && !session.user.isSuperDev) {
    const userCompany = await db.userCompany.findUnique({
      where: { userId_companyId: { 
        userId: session.user.id, 
        companyId: session.activeCompanyId 
      }},
      select: { role: true },
    });
    activeCompanyRole = userCompany?.role ?? null;
  }
  
  return {
    id: session.user.id,
    email: session.user.email,
    businessName: session.user.businessName,
    isSuperDev: session.user.isSuperDev,
    activeCompanyId: session.activeCompanyId,
    activeCompanyRole: session.user.isSuperDev ? 'OWNER' : activeCompanyRole,
    activeCompanyName: session.activeCompany?.name ?? null,
    demoModeEnabled: session.user.demoModeEnabled,
  };
}

// Backwards-compatible wrapper (deprecated, remove in Phase B)
export async function getAuthUser(request?: Request) {
  const ctx = await getAuthContext(request);
  if (!ctx) return null;
  return { id: ctx.id, email: ctx.email, businessName: ctx.businessName };
}
```

### 3B. Session Creation — Auto-select First Company

```typescript
// Updated createSession to auto-set activeCompanyId
export async function createSession(
  userId: string,
  request?: Request
): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_MAX_AGE_DAYS);
  
  // Auto-select the user's first company as active
  const firstCompany = await db.userCompany.findFirst({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: { companyId: true },
  });
  
  const ipAddress = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request?.headers.get('x-real-ip')
    || null;
  const userAgent = request?.headers.get('user-agent') || null;
  
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
```

### 3C. Company Switch Endpoint

```typescript
// POST /api/company/switch
// Body: { companyId: string }
// Sets the activeCompanyId on the current session

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext(request);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  const { companyId } = await request.json();
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 });
  
  // SUPER_DEV can switch to any company
  if (!ctx.isSuperDev) {
    // Verify user belongs to this company
    const membership = await db.userCompany.findUnique({
      where: { userId_companyId: { userId: ctx.id, companyId } },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this company' }, { status: 403 });
    }
  }
  
  // Verify company exists and is active
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company || !company.isActive) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  }
  
  // Update session
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await db.session.update({
      where: { token },
      data: { activeCompanyId: companyId },
    });
  }
  
  return NextResponse.json({ success: true, companyId });
}
```

### 3D. New RBAC Helper Module

```typescript
// src/lib/rbac.ts

import { db } from '@/lib/db';
import { AuthContext } from '@/lib/session';
import { CompanyRole } from '@prisma/client';
import { NextResponse } from 'next/server';

// ─── Permission Checks ────────────────────────────────────────────

const ROLE_HIERARCHY: Record<CompanyRole, number> = {
  OWNER: 5,
  ADMIN: 4,
  ACCOUNTANT: 3,
  VIEWER: 2,
  AUDITOR: 1,
};

function hasMinRole(userRole: CompanyRole | null, minRole: CompanyRole): boolean {
  if (!userRole) return false;
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

// ─── Permission Definitions ───────────────────────────────────────

export const PERMISSIONS = {
  // Company management
  COMPANY_VIEW_SETTINGS:      { minRole: 'VIEWER' as CompanyRole },
  COMPANY_EDIT_SETTINGS:      { minRole: 'ADMIN' as CompanyRole },
  COMPANY_TRANSFER_OWNERSHIP: { minRole: 'OWNER' as CompanyRole },
  COMPANY_DELETE:             { minRole: 'OWNER' as CompanyRole },
  
  // Member management
  MEMBERS_VIEW:               { minRole: 'ADMIN' as CompanyRole },
  MEMBERS_INVITE:             { minRole: 'ADMIN' as CompanyRole },
  MEMBERS_REMOVE:             { minRole: 'ADMIN' as CompanyRole },
  MEMBERS_CHANGE_ROLE:        { minRole: 'OWNER' as CompanyRole },
  
  // Accounting data
  DATA_READ:                  { minRole: 'VIEWER' as CompanyRole },
  DATA_CREATE:                { minRole: 'ACCOUNTANT' as CompanyRole },
  DATA_EDIT:                  { minRole: 'ACCOUNTANT' as CompanyRole },
  DATA_CANCEL:                { minRole: 'ACCOUNTANT' as CompanyRole },
  DATA_DELETE:                { minRole: 'ADMIN' as CompanyRole },
  
  // Reports & Export
  REPORTS_VIEW:               { minRole: 'VIEWER' as CompanyRole },
  REPORTS_EXPORT:             { minRole: 'AUDITOR' as CompanyRole },
  REPORTS_SAFT:               { minRole: 'ACCOUNTANT' as CompanyRole },
  
  // Period management
  PERIOD_CLOSE:               { minRole: 'ACCOUNTANT' as CompanyRole },
  PERIOD_OPEN:                { minRole: 'ADMIN' as CompanyRole },
  
  // Year-end
  YEAR_END_CLOSE:             { minRole: 'ADMIN' as CompanyRole },
  
  // Bank connections
  BANK_CONNECT:               { minRole: 'ADMIN' as CompanyRole },
  BANK_SYNC:                  { minRole: 'ACCOUNTANT' as CompanyRole },
  
  // Backups
  BACKUP_CREATE:              { minRole: 'ADMIN' as CompanyRole },
  BACKUP_RESTORE:             { minRole: 'OWNER' as CompanyRole },
} as const;

export type Permission = keyof typeof PERMISSIONS;

// ─── Check Functions ───────────────────────────────────────────────

/**
 * Check if a user has a specific permission in their active company.
 * Returns true for SUPER_DEV (read-only permissions only).
 */
export function hasPermission(ctx: AuthContext, permission: Permission): boolean {
  // SUPER_DEV: read-only access to everything
  if (ctx.isSuperDev) {
    const readOnly: Permission[] = [
      'COMPANY_VIEW_SETTINGS', 'DATA_READ', 'REPORTS_VIEW',
      'REPORTS_EXPORT', 'MEMBERS_VIEW',
    ];
    return readOnly.includes(permission);
  }
  
  if (!ctx.activeCompanyRole) return false;
  
  const permDef = PERMISSIONS[permission];
  return hasMinRole(ctx.activeCompanyRole as CompanyRole, permDef.minRole);
}

/**
 * Require a specific permission or return a 403 response.
 * Use in API routes:
 *   const forbidden = requirePermission(ctx, 'DATA_CREATE');
 *   if (forbidden) return forbidden;
 */
export function requirePermission(
  ctx: AuthContext,
  permission: Permission
): NextResponse | null {
  if (!ctx.activeCompanyId) {
    return NextResponse.json({ error: 'No active company' }, { status: 400 });
  }
  if (!hasPermission(ctx, permission)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }
  return null;
}

/**
 * Build a Prisma where clause scoped to the active company.
 * For SUPER_DEV with no active company, returns empty (sees all).
 */
export function companyScope(ctx: AuthContext): { companyId: string } | {} {
  if (ctx.activeCompanyId) {
    return { companyId: ctx.activeCompanyId };
  }
  // SUPER_DEV with no active company can see all
  if (ctx.isSuperDev) {
    return {};
  }
  return { companyId: '__none__' }; // No company = no data
}

/**
 * Combined demo + company filter for queries
 */
export function tenantFilter(ctx: AuthContext): Record<string, unknown> {
  const scope = companyScope(ctx);
  const demoFilter = ctx.demoModeEnabled ? { isDemo: true } : { isDemo: false };
  return { ...scope, ...demoFilter };
}
```

---

## 4. RBAC Permission Matrix

### Detailed Role Capabilities

| Action | OWNER | ADMIN | ACCOUNTANT | VIEWER | AUDITOR | SUPER_DEV |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Company Settings** | | | | | | |
| View company settings | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Edit company settings | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Delete company | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Member Management** | | | | | | |
| View members | ✅ | ✅ | ❌ | ❌ | ❌ | 👁️ |
| Invite members | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remove members | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ |
| Change member roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Accounting Data** | | | | | | |
| View transactions/journals | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Create transactions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit transactions | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel (soft-delete) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create invoices | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit invoices | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Chart of Accounts** | | | | | | |
| View accounts | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Create/edit accounts | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Reports & Export** | | | | | | |
| View reports | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Export PDF/Excel | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |
| Export SAF-T | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Period Management** | | | | | | |
| Close fiscal periods | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reopen closed periods | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Year-end closing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Bank** | | | | | | |
| Connect bank accounts | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Sync bank data | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reconcile | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Backups** | | | | | | |
| Create backup | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Restore backup | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Audit Trail** | | | | | | |
| View audit log | ✅ | ✅ | ✅ | ✅ | ✅ | 👁️ |

> \* ADMIN cannot remove OWNER members or change OWNER roles  
> 👁️ = Read-only access (SUPER_DEV cannot mutate any data)

### Special Rules

1. **OWNER is unique**: There can only be one OWNER per company. To transfer ownership, the current OWNER must initiate it, and the target must already be an ADMIN.
2. **Last OWNER protection**: Cannot remove the last OWNER from a company. Must transfer ownership first.
3. **ADMIN removal restriction**: An ADMIN can remove ACCOUNTANT/VIEWER/AUDITOR members, but not other ADMINs or the OWNER.
4. **AUDITOR special**: Can view all data AND export reports, but cannot see member management (emails, roles) unless they also have MEMBER_VIEW (which they don't by default).
5. **SUPER_DEV**: Global read-only across ALL tenants. Cannot create, edit, or delete anything. Accesses data via a special "All Companies" view or by switching into any company.

---

## 5. Prioritized Implementation Order

### Phase A: Schema & Core Infrastructure (Week 1-2)

| # | Task | Files | Est. |
|---|---|---|---|
| A1 | Add new enums (`CompanyRole`, `InvitationStatus`) to Prisma schema | `prisma/schema.prisma` | 0.5h |
| A2 | Add `Company` model to Prisma schema | `prisma/schema.prisma` | 1h |
| A3 | Add `UserCompany` model to Prisma schema | `prisma/schema.prisma` | 0.5h |
| A4 | Add `Invitation` model to Prisma schema | `prisma/schema.prisma` | 0.5h |
| A5 | Add `companyId` to all 12 company-scoped models | `prisma/schema.prisma` | 2h |
| A6 | Add `isSuperDev` to User, `activeCompanyId` to Session | `prisma/schema.prisma` | 0.5h |
| A7 | Add `companyId` and `performedByUserId` to AuditLog | `prisma/schema.prisma` | 0.5h |
| A8 | Run `prisma db push` to apply schema changes | CLI | 0.5h |
| A9 | Create data migration script | `scripts/migrate-to-multi-tenant.ts` | 4h |
| A10 | Run migration script on existing database | CLI | 1h |
| A11 | Create `src/lib/rbac.ts` — permission helpers | `src/lib/rbac.ts` | 3h |
| A12 | Update `src/lib/session.ts` — `getAuthContext()` | `src/lib/session.ts` | 2h |
| A13 | Update `src/lib/audit.ts` — add companyId + performedByUserId | `src/lib/audit.ts` | 1h |
| A14 | Update `src/lib/demo-filter.ts` — use `tenantFilter` from rbac | `src/lib/demo-filter.ts` | 0.5h |

### Phase B: API Routes — Company Scoping (Week 2-3)

**Pattern for every API route:**

```typescript
// BEFORE (current):
const user = await getAuthUser(request);
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const demoFilter = await getDemoFilter(user.id);
const data = await db.transaction.findMany({
  where: { userId: user.id, ...demoFilter },
});

// AFTER (new):
const ctx = await getAuthContext(request);
if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
const forbidden = requirePermission(ctx, 'DATA_READ');
if (forbidden) return forbidden;
const filter = tenantFilter(ctx);
const data = await db.transaction.findMany({ where: filter });
```

| # | Task | Route Count | Est. |
|---|---|---|---|
| B1 | Update auth routes (login, register, me, delete-account) | 4 | 2h |
| B2 | Update company API route | 1 | 2h |
| B3 | Update transaction routes (CRUD, export, descriptions) | 3 | 2h |
| B4 | Update invoice routes (CRUD, PDF, OIOUBL) | 4 | 2h |
| B5 | Update journal entry routes (CRUD) | 2 | 1h |
| B6 | Update account routes (CRUD, seed, trend) | 3 | 1.5h |
| B7 | Update contact routes (CRUD) | 2 | 1h |
| B8 | Update fiscal period routes (CRUD) | 2 | 1h |
| B9 | Update bank routes (statements, connections, reconciliation) | 6 | 3h |
| B10 | Update recurring entry routes (CRUD, execute) | 2 | 1h |
| B11 | Update budget routes (CRUD) | 2 | 1h |
| B12 | Update report routes (reports, P&L, ledger, cash flow, aging, etc.) | 8 | 3h |
| B13 | Update backup routes (CRUD, download) | 3 | 1h |
| B14 | Update audit log route | 1 | 0.5h |
| B15 | Update document routes (CRUD, serve) | 3 | 1h |
| B16 | Update other routes (AI categorize, demo, year-end, etc.) | 6 | 2h |
| B17 | Update VAT register route | 1 | 0.5h |

### Phase C: Company Management API (Week 3)

| # | Task | New Files | Est. |
|---|---|---|---|
| C1 | `POST /api/companies` — Create company | `src/app/api/companies/route.ts` | 1h |
| C2 | `GET /api/companies` — List user's companies | `src/app/api/companies/route.ts` | 1h |
| C3 | `GET /api/companies/[id]` — Get company details | `src/app/api/companies/[id]/route.ts` | 0.5h |
| C4 | `PUT /api/companies/[id]` — Update company | `src/app/api/companies/[id]/route.ts` | 1h |
| C5 | `POST /api/company/switch` — Switch active company | `src/app/api/company/switch/route.ts` | 1h |
| C6 | `POST /api/companies/[id]/transfer-ownership` | `src/app/api/companies/[id]/transfer-ownership/route.ts` | 1.5h |
| C7 | `GET /api/companies/[id]/members` — List members | `src/app/api/companies/[id]/members/route.ts` | 1h |
| C8 | `PUT /api/companies/[id]/members/[userId]` — Change role | `src/app/api/companies/[id]/members/[userId]/route.ts` | 1h |
| C9 | `DELETE /api/companies/[id]/members/[userId]` — Remove member | `src/app/api/companies/[id]/members/[userId]/route.ts` | 1h |
| C10 | `POST /api/companies/[id]/invitations` — Send invite | `src/app/api/companies/[id]/invitations/route.ts` | 2h |
| C11 | `GET /api/companies/[id]/invitations` — List invitations | `src/app/api/companies/[id]/invitations/route.ts` | 0.5h |
| C12 | `DELETE /api/companies/[id]/invitations/[inviteId]` — Revoke | `src/app/api/companies/[id]/invitations/[inviteId]/route.ts` | 0.5h |
| C13 | `POST /api/invitations/accept` — Accept invitation | `src/app/api/invitations/accept/route.ts` | 2h |
| C14 | `GET /api/invitations/verify?token=xxx` — Verify token | `src/app/api/invitations/verify/route.ts` | 1h |

### Phase D: Frontend Changes (Week 3-4)

| # | Task | Files | Est. |
|---|---|---|---|
| D1 | Update `auth-store.ts` — add company context | `src/lib/auth-store.ts` | 1h |
| D2 | Update `/api/auth/me` — return company context | `src/app/api/auth/me/route.ts` | 1h |
| D3 | Create `company-store.ts` — Zustand store for company switching | `src/lib/company-store.ts` | 1h |
| D4 | Create `CompanySelector` component — sidebar dropdown | `src/components/layout/company-selector.tsx` | 3h |
| D5 | Update `app-layout.tsx` — integrate CompanySelector | `src/components/layout/app-layout.tsx` | 2h |
| D6 | Create `MembersPage` component — settings tab | `src/components/settings/members-page.tsx` | 4h |
| D7 | Create `InviteDialog` component | `src/components/settings/invite-dialog.tsx` | 2h |
| D8 | Create `AcceptInvitationPage` component | `src/components/settings/accept-invitation.tsx` | 2h |
| D9 | Update `SettingsPage` — add Members tab | `src/components/settings/settings-page.tsx` | 1h |
| D10 | Update `CompanySettingsPage` — use Company model API | `src/components/settings/company-settings-page.tsx` | 3h |
| D11 | Update `RegisterForm` — create company on registration | `src/components/auth/register-form.tsx` | 1h |
| D12 | Update all page components — pass company context | All page components | 2h |
| D13 | Add role-based UI hiding (hide create buttons for VIEWER, etc.) | Various | 3h |
| D14 | Add SUPER_DEV company browser view | `src/components/super-dev/company-browser.tsx` | 3h |
| D15 | Add invitation acceptance route in page.tsx | `src/app/page.tsx` | 1h |

### Phase E: Testing & Cleanup (Week 4-5)

| # | Task | Est. |
|---|---|---|
| E1 | Test migration script on copy of production DB | 2h |
| E2 | Test all API routes with different roles | 4h |
| E3 | Test company switching doesn't leak data | 2h |
| E4 | Test SUPER_DEV read-only access | 1h |
| E5 | Test invitation flow end-to-end | 2h |
| E6 | Test ownership transfer | 1h |
| E7 | Test GDPR data isolation (companyId scoping) | 2h |
| E8 | Performance: add missing indexes | 1h |
| E9 | Remove `userId` from company-scoped models (Phase B cleanup) | 4h |
| E10 | Remove `CompanyInfo` model after full migration | 1h |
| E11 | Update `getAuthUser()` calls to `getAuthContext()` everywhere | 2h |
| E12 | Documentation update | 2h |

---

## 6. Data Migration Strategy

### 6A. Migration Script Overview

```typescript
// scripts/migrate-to-multi-tenant.ts

/**
 * One-time migration: Convert single-tenant data to multi-tenant.
 * 
 * For each existing User:
 * 1. Create a Company record from their CompanyInfo data
 * 2. Create a UserCompany record (OWNER role)
 * 3. Set companyId on all company-scoped records
 * 4. Set activeCompanyId on all Sessions
 * 5. Add companyId to all AuditLogs
 * 
 * After successful migration:
 * - Every user has exactly one company (their own)
 * - All data is properly scoped to that company
 * - The system works exactly as before, but through the new multi-tenant path
 */
```

### 6B. Detailed Migration Steps

```typescript
import { db } from '../src/lib/db';

async function migrateToMultiTenant() {
  console.log('Starting multi-tenant migration...');
  
  // Step 1: Get all users with their CompanyInfo
  const users = await db.user.findMany({
    include: {
      companyInfos: true,
      sessions: true,
    },
  });
  
  console.log(`Found ${users.length} users to migrate`);
  
  for (const user of users) {
    console.log(`\nMigrating user: ${user.email}`);
    
    // Handle case where user has both demo and live CompanyInfo
    // Group by isDemo flag
    const liveInfo = user.companyInfos.find(ci => !ci.isDemo);
    const demoInfo = user.companyInfos.find(ci => ci.isDemo);
    
    // Create LIVE company (primary)
    const info = liveInfo || demoInfo; // Fallback to demo if no live
    const liveCompany = await db.company.create({
      data: {
        name: info?.companyName || user.businessName || user.email.split('@')[0],
        logo: info?.logo || null,
        address: info?.address || '',
        phone: info?.phone || '',
        email: info?.email || user.email,
        cvrNumber: info?.cvrNumber || `MIGRATED-${user.id.slice(0, 8)}`,
        companyType: info?.companyType || null,
        invoicePrefix: info?.invoicePrefix || 'INV',
        invoiceTerms: info?.invoiceTerms || null,
        invoiceNotesTemplate: info?.invoiceNotesTemplate || null,
        nextInvoiceSequence: info?.nextInvoiceSequence || 1,
        currentYear: info?.currentYear || new Date().getFullYear(),
        bankName: info?.bankName || '',
        bankAccount: info?.bankAccount || '',
        bankRegistration: info?.bankRegistration || '',
        bankIban: info?.bankIban || null,
        bankStreet: info?.bankStreet || null,
        bankCity: info?.bankCity || null,
        bankCountry: info?.bankCountry || null,
        isDemo: false,
      },
    });
    
    console.log(`  Created Company: ${liveCompany.name} (${liveCompany.id})`);
    
    // Create UserCompany (OWNER role) for live company
    await db.userCompany.create({
      data: {
        userId: user.id,
        companyId: liveCompany.id,
        role: 'OWNER',
        invitedBy: null,
      },
    });
    
    // If user has demo CompanyInfo, create a separate demo company
    let demoCompanyId: string | null = null;
    if (demoInfo && user.companyInfos.length > 1) {
      const demoCompany = await db.company.create({
        data: {
          name: demoInfo.companyName || `${liveCompany.name} (Demo)`,
          logo: demoInfo.logo || null,
          address: demoInfo.address || '',
          phone: demoInfo.phone || '',
          email: demoInfo.email || user.email,
          cvrNumber: demoInfo.cvrNumber || `MIGRATED-DEMO-${user.id.slice(0, 8)}`,
          companyType: demoInfo.companyType || null,
          invoicePrefix: demoInfo.invoicePrefix || 'INV',
          invoiceTerms: demoInfo.invoiceTerms || null,
          invoiceNotesTemplate: demoInfo.invoiceNotesTemplate || null,
          nextInvoiceSequence: demoInfo.nextInvoiceSequence || 1,
          currentYear: demoInfo.currentYear || new Date().getFullYear(),
          bankName: demoInfo.bankName || '',
          bankAccount: demoInfo.bankAccount || '',
          bankRegistration: demoInfo.bankRegistration || '',
          bankIban: demoInfo.bankIban || null,
          bankStreet: demoInfo.bankStreet || null,
          bankCity: demoInfo.bankCity || null,
          bankCountry: demoInfo.bankCountry || null,
          isDemo: true,
        },
      });
      
      demoCompanyId = demoCompany.id;
      
      await db.userCompany.create({
        data: {
          userId: user.id,
          companyId: demoCompany.id,
          role: 'OWNER',
          invitedBy: null,
        },
      });
      
      console.log(`  Created Demo Company: ${demoCompany.name}`);
    }
    
    // Step: Migrate data based on isDemo flag
    const targetLiveId = liveCompany.id;
    const targetDemoId = demoCompanyId;
    
    // Non-demo data → live company
    await db.transaction.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.invoice.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.account.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.journalEntry.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.contact.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.fiscalPeriod.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.bankStatement.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.bankConnection.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.recurringEntry.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.budget.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    await db.backup.updateMany({ 
      where: { userId: user.id, isDemo: false }, 
      data: { companyId: targetLiveId } 
    });
    
    // Demo data → demo company (if exists)
    if (targetDemoId) {
      await db.transaction.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.invoice.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.account.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.journalEntry.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.contact.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.fiscalPeriod.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.bankStatement.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.bankConnection.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.recurringEntry.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
      await db.budget.updateMany({ 
        where: { userId: user.id, isDemo: true }, 
        data: { companyId: targetDemoId } 
      });
    }
    
    // Set activeCompanyId on sessions
    // Use live company as default active
    await db.session.updateMany({ 
      where: { userId: user.id }, 
      data: { activeCompanyId: targetLiveId } 
    });
    
    // Update audit logs
    await db.auditLog.updateMany({ 
      where: { userId: user.id }, 
      data: { companyId: targetLiveId, performedByUserId: user.id } 
    });
    
    console.log(`  All data migrated successfully`);
  }
  
  // Verification
  console.log('\n--- Verification ---');
  
  const orphaned = await db.transaction.findMany({
    where: { companyId: null },
    take: 5,
  });
  if (orphaned.length > 0) {
    console.error(`WARNING: Found ${orphaned.length} transactions without companyId!`);
  } else {
    console.log('All transactions have companyId');
  }
  
  const usersWithoutCompany = await db.user.findMany({
    where: { companies: { none: {} } },
    take: 5,
  });
  if (usersWithoutCompany.length > 0) {
    console.error(`WARNING: Found ${usersWithoutCompany.length} users without a company!`);
  } else {
    console.log('All users have at least one company');
  }
  
  console.log('\nMigration complete!');
}

migrateToMultiTenant()
  .catch(console.error)
  .finally(() => db.$disconnect());
```

### 6C. Migration Safety Measures

1. **Backup before migration**: The existing backup system creates a DB snapshot
2. **Dry-run mode**: Add `--dry-run` flag that logs what would happen without executing
3. **Idempotency**: Check if Company already exists for a user before creating
4. **Rollback plan**: Keep the `CompanyInfo` records until Phase E10. The old `userId` indexes still work during transition.
5. **Handle users without CompanyInfo**: Create a placeholder Company with minimal data and a special CVR prefix `MIGRATED-`
6. **Handle demo mode users**: The `isDemo` flag from CompanyInfo carries over to Company. A user may have had both demo and live CompanyInfo — in that case, create two Companies.

### 6D. Demo Mode Edge Case

The current system uses `isDemo` on CompanyInfo with `@@unique([userId, isDemo])`. This means a user could have:
- 1 live CompanyInfo (isDemo: false)
- 1 demo CompanyInfo (isDemo: true)

In the new model, each of these becomes a separate `Company`. The user becomes OWNER of both companies. The `demoModeEnabled` flag on User determines which company they see by default.

During migration, if a user has both demo and live CompanyInfo:
1. Create 2 Company records (one demo, one live)
2. Create 2 UserCompany records (OWNER for both)
3. Set the live company as `activeCompanyId` on sessions
4. Migrate the isDemo-specific data to the correct Company

### 6E. Post-Migration Cleanup (Phase E9-E10)

After confirming everything works:

1. **Remove `userId` from company-scoped models** — Update Prisma schema, remove the `userId` field and its relation from: Transaction, Invoice, Account, JournalEntry, Contact, FiscalPeriod, BankStatement, BankConnection, RecurringEntry, Budget, Backup
2. **Remove `CompanyInfo` model** — No longer needed
3. **Remove `businessName` from User** — Moved to Company name
4. **Update cascade deletes** — Change from `onDelete: Cascade` on User to `onDelete: Cascade` on Company for company-scoped models

---

## 7. Frontend Changes Summary

### 7A. Auth Store Update

```typescript
// src/lib/auth-store.ts — Updated interface

export interface User {
  id: string;
  email: string;
  businessName?: string | null;
  demoModeEnabled?: boolean;
  isSuperDev?: boolean;              // NEW
  activeCompanyId?: string | null;   // NEW
  activeCompanyRole?: string | null; // NEW
  activeCompanyName?: string | null; // NEW
}
```

### 7B. New Company Store

```typescript
// src/lib/company-store.ts — New file

import { create } from 'zustand';

interface Company {
  id: string;
  name: string;
  cvrNumber: string;
  isDemo: boolean;
  role: string;  // CompanyRole
}

interface CompanyState {
  companies: Company[];
  isLoading: boolean;
  activeCompanyId: string | null;
  fetchCompanies: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
}

export const useCompanyStore = create<CompanyState>()((set, get) => ({
  companies: [],
  isLoading: false,
  activeCompanyId: null,
  
  fetchCompanies: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/companies');
      const data = await res.json();
      set({ companies: data.companies, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
  
  switchCompany: async (companyId: string) => {
    try {
      const res = await fetch('/api/company/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      if (res.ok) {
        set({ activeCompanyId: companyId });
        // Full reload to ensure complete tenant isolation
        window.location.reload();
      }
    } catch (error) {
      console.error('Failed to switch company:', error);
    }
  },
}));
```

### 7C. CompanySelector Component

**Location**: Top of sidebar, below the logo area

```
┌─────────────────────────┐
│     [AlphaAi Logo]      │
├─────────────────────────┤
│ ▼ AlphaAi ApS    [CVR]  │  ← CompanySelector dropdown
│   Owner ●               │  ← Role badge
├─────────────────────────┤
│ Dashboard               │
│ Transactions            │
│ ...                     │
```

**Behavior**:
- **Single company users**: Shows company name as static text with a small badge showing role. Clicking it navigates to Company Settings.
- **Multi-company users**: Shows a dropdown with all companies. Clicking one switches the active company (calls `/api/company/switch`, then reloads).
- **SUPER_DEV users**: Shows "All Companies" view with a searchable dropdown of ALL companies in the system.

### 7D. Settings Page — New "Members" Tab

The Settings page currently has 3 tabs: Appearance, Defaults, Company. A 4th tab is added:

```
┌──────────┬──────────┬──────────┬──────────┐
│ Palette  │ Defaults │ Building │ Users    │
│          │          │          │          │
└──────────┴──────────┴──────────┴──────────┘
```

**Members tab content**:
- List of current members with name, email, role, joined date
- "Invite Member" button (opens InviteDialog)
- Role change dropdown (OWNER only can change roles)
- Remove member button (with confirmation)
- Pending invitations section with status and revoke option

**Role badges**: Color-coded
- OWNER: Gold/amber badge
- ADMIN: Blue badge  
- ACCOUNTANT: Green badge
- VIEWER: Gray badge
- AUDITOR: Purple badge

### 7E. Invite Flow

```
1. Owner/Admin clicks "Invite Member"
2. InviteDialog opens:
   - Email input (required)
   - Role selector dropdown (ACCOUNTANT, VIEWER, AUDITOR — ADMIN/OWNER only for OWNER)
   - "Send Invitation" button
3. Backend:
   - Creates Invitation record with crypto token
   - Sends email with link: https://app.alphaai.dk/invite?token=xxx
4. Recipient:
   - If already logged in: sees AcceptInvitationPage with company name, inviter, role
   - If not logged in: prompted to register first, then sees invitation
5. On accept:
   - UserCompany record created
   - Invitation status → ACCEPTED
   - User can now switch to this company
```

### 7F. Registration Changes

The registration form currently asks for `businessName`. After multi-tenant:

1. User registers with email + password
2. A default Company is created automatically with their email as placeholder
3. User is redirected to Company Settings to fill in actual company details
4. This keeps registration simple while ensuring every user has a company

**Updated register API flow**:
```typescript
// POST /api/auth/register
const user = await db.user.create({ data: { email, password } });
const company = await db.company.create({ 
  data: { name: email.split('@')[0], /* ...minimal defaults */ } 
});
await db.userCompany.create({ 
  data: { userId: user.id, companyId: company.id, role: 'OWNER' } 
});
const token = await createSession(user.id, request); // auto-sets activeCompanyId
```

### 7G. Role-Based UI Changes

**Hide create/edit buttons for VIEWER/AUDITOR**:
- Transactions: Hide "Add Transaction" button for VIEWER/AUDITOR
- Invoices: Hide "Create Invoice" button for VIEWER/AUDITOR
- Journal Entries: Hide "New Entry" button for VIEWER/AUDITOR
- Accounts: Hide "Add Account" for VIEWER/AUDITOR
- Contacts: Hide "Add Contact" for VIEWER/AUDITOR
- Fiscal Periods: Hide "Close Period" for VIEWER/AUDITOR
- Settings: Hide "Save" on Company tab for non-ADMIN
- Backups: Hide "Create Backup" for non-ADMIN, "Restore" for non-OWNER

**Implementation approach**: Create a `usePermission` hook:

```typescript
// src/lib/use-permission.ts

import { useAuthStore, User } from '@/lib/auth-store';

type Permission = 
  | 'canCreate' | 'canEdit' | 'canDelete' 
  | 'canManageMembers' | 'canChangeSettings'
  | 'canClosePeriod' | 'canCreateBackup' | 'canRestoreBackup'
  | 'canConnectBank' | 'canExportSaft';

export function usePermission(): Record<Permission, boolean> {
  const { user } = useAuthStore();
  const role = user?.activeCompanyRole;
  const isSuperDev = user?.isSuperDev;
  
  return {
    canCreate:         ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(role || '') && !isSuperDev,
    canEdit:           ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(role || '') && !isSuperDev,
    canDelete:         ['OWNER', 'ADMIN'].includes(role || '') && !isSuperDev,
    canManageMembers:  ['OWNER', 'ADMIN'].includes(role || '') && !isSuperDev,
    canChangeSettings: ['OWNER', 'ADMIN'].includes(role || '') && !isSuperDev,
    canClosePeriod:    ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(role || '') && !isSuperDev,
    canCreateBackup:   ['OWNER', 'ADMIN'].includes(role || '') && !isSuperDev,
    canRestoreBackup:  role === 'OWNER' && !isSuperDev,
    canConnectBank:    ['OWNER', 'ADMIN'].includes(role || '') && !isSuperDev,
    canExportSaft:     ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(role || ''),
  };
}
```

### 7H. SUPER_DEV View

When `isSuperDev` is true, the sidebar shows a special company browser instead of the normal CompanySelector:

```
┌─────────────────────────────┐
│ Search all companies...     │
├─────────────────────────────┤
│ AlphaAi ApS        [VIEW]   │
│ Jensen Consulting  [VIEW]   │  
│ Nordisk Design     [VIEW]   │
│ ... (paginated)             │
├─────────────────────────────┤
│ Quick Stats                 │
│ Total companies: 142        │
│ Active users: 89            │
└─────────────────────────────┘
```

Clicking "VIEW" on a company switches the SUPER_DEV into that company's context (read-only). All create/edit/delete buttons are hidden. A banner at the top says "Read-only mode — Viewing [Company Name] as SUPER_DEV".

### 7I. Company Switch Reload Strategy

When a user switches companies:
1. Call `POST /api/company/switch` (updates session)
2. Clear all cached data (Zustand stores, React Query cache)
3. `window.location.reload()` — full reload to re-fetch everything

This is the simplest and safest approach. Partial state updates are error-prone with 20+ data models. A full reload ensures complete tenant isolation.

### 7J. Invitation Acceptance Route

Add a new route in `page.tsx` that handles invitation tokens:

```typescript
// In page.tsx, add URL param handling
// When URL is /?invite=xxx, show AcceptInvitationPage instead of normal content

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const inviteToken = params.get('invite');
  if (inviteToken) {
    setPendingInviteToken(inviteToken);
  }
}, []);

// If pendingInviteToken and user is logged in, show AcceptInvitationPage
// If pendingInviteToken and user is NOT logged in, show login form with message
```

---

## Appendix A: API Route Migration Checklist

Every API route needs to be updated. Here's the complete checklist:

| Route File | Current Pattern | New Pattern | Permission |
|---|---|---|---|
| `api/auth/login` | `getAuthUser` | `getAuthContext` | N/A |
| `api/auth/register` | Creates User | Creates User + Company + UserCompany | N/A |
| `api/auth/me` | Returns user | Returns user + company context | N/A |
| `api/auth/logout` | No change needed | No change | N/A |
| `api/auth/delete-account` | Deletes user | Leaves companies, transfers if last OWNER | N/A |
| `api/transactions` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/transactions/export` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_EXPORT |
| `api/transactions/export-peppol` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_EXPORT |
| `api/transactions/recent-descriptions` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ |
| `api/invoices` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/invoices/[id]` | `userId: user.id` | Verify `companyId` | DATA_READ/DATA_EDIT |
| `api/invoices/[id]/pdf` | `userId: user.id` | Verify `companyId` | REPORTS_EXPORT |
| `api/invoices/[id]/oioubl` | `userId: user.id` | Verify `companyId` | REPORTS_EXPORT |
| `api/invoices/[id]/oioubl/validate` | `userId: user.id` | Verify `companyId` | REPORTS_EXPORT |
| `api/accounts` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/accounts/[id]` | `userId: user.id` | Verify `companyId` | DATA_READ/DATA_EDIT |
| `api/accounts/seed` | `userId: user.id` | `tenantFilter(ctx)` + create with `companyId` | DATA_CREATE |
| `api/account-trend` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ |
| `api/journal-entries` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/journal-entries/[id]` | `userId: user.id` | Verify `companyId` | DATA_READ/DATA_EDIT |
| `api/contacts` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/contacts/[id]` | `userId: user.id` | Verify `companyId` | DATA_READ/DATA_EDIT |
| `api/fiscal-periods` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/PERIOD_CLOSE |
| `api/fiscal-periods/[id]` | `userId: user.id` | Verify `companyId` | DATA_READ/PERIOD_CLOSE |
| `api/bank-connections` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/BANK_CONNECT |
| `api/bank-connections/[id]` | `userId: user.id` | Verify `companyId` | BANK_CONNECT/BANK_SYNC |
| `api/bank-connections/[id]/sync` | `userId: user.id` | Verify `companyId` | BANK_SYNC |
| `api/bank-connections/[id]/consent` | `userId: user.id` | Verify `companyId` | BANK_CONNECT |
| `api/bank-connections/consent-callback` | Session-based | Verify `companyId` | N/A (callback) |
| `api/bank-reconciliation` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_EDIT |
| `api/recurring-entries` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/recurring-entries/execute` | `userId: user.id` | `tenantFilter(ctx)` | DATA_CREATE |
| `api/budgets` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/ledger` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ |
| `api/reports` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_VIEW |
| `api/profit-loss` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_VIEW |
| `api/cash-flow` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_VIEW |
| `api/cash-flow-forecast` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_VIEW |
| `api/aging-reports` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_VIEW |
| `api/budget-vs-actual` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_VIEW |
| `api/financial-health` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ |
| `api/vat-register` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_VIEW |
| `api/year-end-closing` | `userId: user.id` | `tenantFilter(ctx)` | YEAR_END_CLOSE |
| `api/ai-categorize` | `userId: user.id` | `tenantFilter(ctx)` | DATA_CREATE |
| `api/expense-categories` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ |
| `api/export-saft` | `userId: user.id` | `tenantFilter(ctx)` | REPORTS_SAFT |
| `api/backups` | `userId: user.id` | `tenantFilter(ctx)` | BACKUP_CREATE |
| `api/backups/[id]` | `userId: user.id` | Verify `companyId` | DATA_READ |
| `api/backups/download/[id]` | `userId: user.id` | Verify `companyId` | DATA_READ |
| `api/audit-logs` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ |
| `api/documents` | `userId: user.id` | `tenantFilter(ctx)` | DATA_READ/DATA_CREATE |
| `api/documents/[id]` | `userId: user.id` | Verify via JournalEntry.companyId | DATA_READ |
| `api/documents/serve/[...path]` | `userId: user.id` | Verify via JournalEntry.companyId | DATA_READ |
| `api/receipts/[...path]` | `userId: user.id` | Verify via Transaction.companyId | DATA_READ |
| `api/company` | `userId: user.id` | `GET`: ctx.activeCompanyId, `PUT`: requirePermission(ADMIN) | COMPANY_VIEW/EDIT |
| `api/user/preferences` | `userId: user.id` | No change (user-level, not company) | N/A |
| `api/demo-mode` | `userId: user.id` | No change (user-level) | N/A |
| `api/demo-seed` | `userId: user.id` | Create with `companyId` | DATA_CREATE |
| `api/route.ts` | Health check | No change | N/A |

---

## Appendix B: File Tree of New/Modified Files

### New Files
```
src/lib/rbac.ts                              # RBAC permission system
src/lib/company-store.ts                     # Zustand company selector store
src/lib/use-permission.ts                    # React hook for permission checks
src/components/layout/company-selector.tsx    # Company dropdown in sidebar
src/components/settings/members-page.tsx      # Member management UI
src/components/settings/invite-dialog.tsx     # Invitation dialog
src/components/settings/accept-invitation.tsx # Invitation acceptance page
src/components/settings/role-badge.tsx        # Role badge component
src/components/super-dev/company-browser.tsx  # SUPER_DEV company list
scripts/migrate-to-multi-tenant.ts           # Migration script

# New API routes
src/app/api/companies/route.ts
src/app/api/companies/[id]/route.ts
src/app/api/companies/[id]/members/route.ts
src/app/api/companies/[id]/members/[userId]/route.ts
src/app/api/companies/[id]/invitations/route.ts
src/app/api/companies/[id]/invitations/[inviteId]/route.ts
src/app/api/companies/[id]/transfer-ownership/route.ts
src/app/api/company/switch/route.ts
src/app/api/invitations/accept/route.ts
src/app/api/invitations/verify/route.ts
```

### Modified Files (57 API routes + key lib/component files)
```
prisma/schema.prisma
src/lib/session.ts
src/lib/audit.ts
src/lib/auth-store.ts
src/lib/demo-filter.ts
src/app/page.tsx
src/app/api/auth/login/route.ts
src/app/api/auth/register/route.ts
src/app/api/auth/me/route.ts
src/app/api/auth/delete-account/route.ts
src/app/api/company/route.ts
src/app/api/transactions/route.ts
... (all 57 API routes listed in Appendix A)
src/components/layout/app-layout.tsx
src/components/settings/settings-page.tsx
src/components/settings/company-settings-page.tsx
src/components/auth/register-form.tsx
... (all page components that show/hide create buttons)
```

---

## Appendix C: Time Estimate Summary

| Phase | Duration | Cumulative |
|---|---|---|
| A: Schema & Core Infrastructure | 17h (~2 weeks) | 2 weeks |
| B: API Route Migration | 25.5h (~2 weeks) | 4 weeks |
| C: Company Management API | 14.5h (~1.5 weeks) | 5.5 weeks |
| D: Frontend Changes | 31h (~2.5 weeks) | 8 weeks |
| E: Testing & Cleanup | 24h (~2 weeks) | 10 weeks |

**Total estimated effort: ~112 hours (10 weeks with 1 person)**

This can be parallelized significantly — Phase B and Phase C can happen simultaneously, and Phase D can start as soon as Phase A is complete.

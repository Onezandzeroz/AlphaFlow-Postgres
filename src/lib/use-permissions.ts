/**
 * Frontend permission hook for role-based UI hiding.
 *
 * Usage:
 *   const { canCreate, canEdit, canDelete, role, isViewer } = usePermissions();
 *
 *   if (canCreate) { <button>Create</button> }
 *
 * When in oversight mode (isOversightMode), all mutation permissions are
 * forced to false — the UI hides all create/edit/delete controls.
 */

import { useAuthStore } from '@/lib/auth-store';
import { getRoleLevel } from '@/lib/rbac';

export type RoleLevel = 'OWNER' | 'ADMIN' | 'ACCOUNTANT' | 'VIEWER' | 'AUDITOR';

export function usePermissions() {
  const user = useAuthStore(state => state.user);
  const role = (user?.activeCompanyRole as RoleLevel) || null;
  const level = getRoleLevel(role);
  const isOversightMode = user?.isOversightMode ?? false;

  const isOwner = level >= 5;
  const isAdmin = level >= 4;
  const isAccountant = level >= 3;
  const isViewer = level >= 2;
  const isSuperDev = user?.isSuperDev ?? false;

  // In oversight mode, ALL mutation permissions are blocked
  const oversightBlock = isOversightMode;

  return {
    role,
    level,
    isOwner,
    isAdmin,
    isAccountant,
    isViewer,
    isSuperDev,
    isOversightMode,
    isAtLeastAccountant: isAccountant,
    isAtLeastAdmin: isAdmin,

    // Data permissions (blocked in oversight mode)
    canRead: isViewer,
    canCreate: !oversightBlock && isAccountant,
    canEdit: !oversightBlock && isAccountant,
    canCancel: !oversightBlock && isAccountant,
    canDelete: !oversightBlock && isAdmin,

    // Company settings (blocked in oversight mode)
    canViewSettings: isViewer,
    canEditSettings: !oversightBlock && isAdmin,

    // Member management (blocked in oversight mode)
    canViewMembers: isAdmin,
    canInviteMembers: !oversightBlock && isAdmin,
    canRemoveMembers: !oversightBlock && isAdmin,
    canChangeRoles: !oversightBlock && isOwner,

    // Reports (read-only, OK in oversight)
    canViewReports: isViewer,
    canExportReports: isViewer,
    canExportSaft: !oversightBlock && isAccountant,

    // Period management (blocked in oversight mode)
    canClosePeriod: !oversightBlock && isAccountant,
    canReopenPeriod: !oversightBlock && isAdmin,
    canYearEndClose: !oversightBlock && isAdmin,

    // Bank (blocked in oversight mode)
    canConnectBank: !oversightBlock && isAdmin,
    canSyncBank: !oversightBlock && isAccountant,

    // Backup (blocked in oversight mode)
    canCreateBackup: !oversightBlock && isAdmin,
    canRestoreBackup: !oversightBlock && isOwner,

    // Super dev: read-only in oversight mode, full OWNER in own company
    isReadOnly: (isSuperDev && isOversightMode) || (!isSuperDev && !isAccountant),
  };
}

import { create } from 'zustand';

/**
 * Permissions store — holds the current user's resolved permissions.
 * Defaults to FULL ACCESS when offline/unknown so owners never get locked out.
 */

const FULL_ACCESS = {
  can_manage_team: true,
  can_delete_records: true,
  can_edit_settings: true,
  can_add_records: true,
  can_view_reports: true,
};

export const usePermissionsStore = create((set, get) => ({
  permissions: { ...FULL_ACCESS },
  setPermissions: (next) => set({ permissions: next }),
  
  /**
   * Check if current user has a specific permission.
   * Always returns TRUE when offline/unknown (defensive: never lock out).
   */
  hasPermission: (key) => {
    const perms = get().permissions;
    if (!perms || typeof perms !== 'object') return true;
    return perms[key] === true;
  },

  /**
   * Reset to full access (e.g., when user logs out or unknown state).
   */
  resetPermissions: () => set({ permissions: { ...FULL_ACCESS } }),
}));

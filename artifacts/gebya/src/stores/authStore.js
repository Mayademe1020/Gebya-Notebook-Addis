import { create } from 'zustand';
import { getAuthToken } from '../utils/syncEngine';
import { usePermissionsStore } from './permissionsStore';

/**
 * Auth state: user identity, JWT token, login status, role, permissions.
 * Persists token to IndexedDB via syncEngine helpers.
 */

export const useAuthStore = create((set, get) => ({
  // null = not checked yet, false = no user / logged out, object = logged in user
  user: null,
  checked: false,
  role: null,
  permissions: null,

  setUser: (user) => set({ user, checked: true }),

  init: async () => {
    const token = await getAuthToken();
    if (!token) {
      set({ user: false, checked: true, role: null, permissions: null });
      usePermissionsStore.getState().resetPermissions();
      return;
    }
    try {
      const { getCurrentUser } = await import('../utils/authClient');
      const data = await getCurrentUser(token);
      const user = data.user;
      const role = data.role || null;
      const rawPerms = data.permissions;

      // Resolve permissions: if server returned null, default to full access (never lock out owner)
      const resolvedPerms = resolvePermissions(role, rawPerms);
      usePermissionsStore.getState().setPermissions(resolvedPerms);

      set({ user, checked: true, role, permissions: rawPerms });
    } catch (err) {
      const { clearAuthToken } = await import('../utils/syncEngine');
      await clearAuthToken();
      usePermissionsStore.getState().resetPermissions();
      set({ user: false, checked: true, role: null, permissions: null });
    }
  },

  login: async (token, user, role, rawPermissions) => {
    const { setAuthToken } = await import('../utils/syncEngine');
    await setAuthToken(token);
    const resolvedPerms = resolvePermissions(role, rawPermissions);
    usePermissionsStore.getState().setPermissions(resolvedPerms);
    set({ user, checked: true, role, permissions: rawPermissions });
  },

  logout: async () => {
    const { clearAuthToken } = await import('../utils/syncEngine');
    await clearAuthToken();
    usePermissionsStore.getState().resetPermissions();
    set({ user: false, checked: true, role: null, permissions: null });
  },
}));

// Default permission maps (mirrors server defaults)
const DEFAULT_PERMISSIONS = {
  owner:   { can_manage_team: true, can_delete_records: true, can_edit_settings: true, can_add_records: true, can_view_reports: true },
  cashier: { can_manage_team: false, can_delete_records: false, can_edit_settings: false, can_add_records: true, can_view_reports: true },
  viewer:  { can_manage_team: false, can_delete_records: false, can_edit_settings: false, can_add_records: false, can_view_reports: true },
};

function resolvePermissions(role, storedPermissions) {
  const base = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.viewer;
  if (!storedPermissions || typeof storedPermissions !== 'object') return base;
  return { ...base, ...storedPermissions };
}

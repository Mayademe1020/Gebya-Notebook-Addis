import { create } from 'zustand';
import { getAuthToken } from '../utils/syncEngine';

/**
 * Auth state: user identity, JWT token, login status.
 * Persists token to IndexedDB via syncEngine helpers.
 */

export const useAuthStore = create((set, get) => ({
  // null = not checked yet, false = no user / logged out, object = logged in user
  user: null,
  checked: false,

  setUser: (user) => set({ user, checked: true }),

  init: async () => {
    const token = await getAuthToken();
    if (!token) {
      set({ user: false, checked: true });
      return;
    }
    try {
      const { getCurrentUser } = await import('../utils/authClient');
      const user = await getCurrentUser(token);
      set({ user, checked: true });
    } catch (err) {
      const { clearAuthToken } = await import('../utils/syncEngine');
      await clearAuthToken();
      set({ user: false, checked: true });
    }
  },

  login: async (token, user) => {
    const { setAuthToken } = await import('../utils/syncEngine');
    await setAuthToken(token);
    set({ user, checked: true });
  },

  logout: async () => {
    const { clearAuthToken } = await import('../utils/syncEngine');
    await clearAuthToken();
    set({ user: false, checked: true });
  },
}));

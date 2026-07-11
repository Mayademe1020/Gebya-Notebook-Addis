import { create } from 'zustand';
import { notificationsApi } from '../api/notifications';
import { getAuthToken } from '../utils/syncEngine';

export const useNotificationsStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  total: 0,
  loading: false,
  loadingMore: false,
  fetched: false,
  lastFetchedAt: 0,

  fetchNotifications: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const token = await getAuthToken();
      if (!token) { set({ loading: false }); return; }
      const data = await notificationsApi.list({ limit: 50, offset: 0 }, token);
      set({ notifications: data.notifications || [], total: data.total || 0, fetched: true, lastFetchedAt: Date.now() });
    } catch (err) {
      console.error('[notifications] fetch failed:', err);
    } finally {
      set({ loading: false });
    }
  },

  fetchMore: async () => {
    const { notifications, total, loadingMore } = get();
    if (loadingMore || notifications.length >= total) return;
    set({ loadingMore: true });
    try {
      const token = await getAuthToken();
      if (!token) { set({ loadingMore: false }); return; }
      const data = await notificationsApi.list({ limit: 50, offset: notifications.length }, token);
      set({ notifications: [...notifications, ...(data.notifications || [])] });
    } catch (err) {
      console.error('[notifications] fetchMore failed:', err);
    } finally {
      set({ loadingMore: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      const data = await notificationsApi.unreadCount(token);
      set({ unreadCount: data.count || 0, lastFetchedAt: Date.now() });
    } catch (err) {
      console.error('[notifications] unreadCount failed:', err);
    }
  },

  markAsRead: async (id) => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      await notificationsApi.markRead(id, token);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (err) {
      console.error('[notifications] markRead failed:', err);
    }
  },

  markAllAsRead: async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      await notificationsApi.markAllRead(token);
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (err) {
      console.error('[notifications] markAllRead failed:', err);
    }
  },
}));

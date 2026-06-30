import { create } from 'zustand';

/**
 * Sync engine state: status, errors, last sync time.
 * Updated by the syncEngine utility (subscribes to this store).
 */

export const useSyncStore = create((set) => ({
  status: 'idle',   // idle | syncing | error | offline | unauthenticated
  error: null,
  lastSyncAt: 0,
  online: true,
  conflictWarning: null,
  lastConflicts: [],

  setSyncState: (state) => set(state),
  setConflictWarning: (warning) => set({ conflictWarning: warning }),
  setLastConflicts: (conflicts) => set({ lastConflicts: conflicts }),
}));

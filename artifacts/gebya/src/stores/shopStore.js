import { create } from 'zustand';

/**
 * Shop-level settings: profile, payment channels, alerts, preferences.
 * This is the canonical source for anything that appears in SettingsPage.
 */

export const useShopStore = create((set, get) => ({
  // ─── Profile ───
  shopProfile: null,
  setShopProfile: (v) => set({ shopProfile: v }),

  // ─── Payment channels ───
  paymentChannels: [],
  setPaymentChannels: (v) => set({ paymentChannels: v }),

  // ─── Recurring expenses ───
  recurringExpenses: [],
  setRecurringExpenses: (v) => set({ recurringExpenses: v }),

  // ─── Quick amounts ───
  customQuickAmounts: [],
  setCustomQuickAmounts: (v) => set({ customQuickAmounts: v }),

  // ─── Last payment (for UI default) ───
  lastPayment: {
    sale: { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
    expense: { type: 'cash', provider: '', bankProvider: '', walletProvider: '' },
  },
  setLastPayment: (v) => set({ lastPayment: v }),

  // ─── Owner alert ───
  ownerAlertSettings: { threshold_amount: 500 },
  setOwnerAlertSettings: (v) => set({ ownerAlertSettings: v }),

  // ─── Analytics / usage ───
  usageStats: null,
  setUsageStats: (v) => set({ usageStats: v }),

  // ─── Last saved snapshot (for trust card) ───
  lastSavedSnapshot: null,
  setLastSavedSnapshot: (v) => set({ lastSavedSnapshot: v }),
}));

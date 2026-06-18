import { create } from 'zustand';
import { getAuthToken } from '../utils/syncEngine';

/**
 * Global app-level UI state.
 * Contains: active tab, loading, modals, toast, onboarding, nav.
 */

export const useAppStore = create((set, get) => ({
  // ─── Tab & Navigation ───
  activeTab: 'today',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // ─── Loading ───
  loading: true,
  setLoading: (v) => set({ loading: v }),

  // ─── Modals / Sheets (single source of truth) ───
  showForm: null,               // 'sale' | 'expense' | null
  setShowForm: (v) => set({ showForm: v }),

  showCustomerForm: false,
  setShowCustomerForm: (v) => set({ showCustomerForm: v }),

  customerEditTarget: null,
  setCustomerEditTarget: (v) => set({ customerEditTarget: v }),

  customerTransactionModal: null,
  setCustomerTransactionModal: (v) => set({ customerTransactionModal: v }),

  customerTransactionEditTarget: null,
  setCustomerTransactionEditTarget: (v) => set({ customerTransactionEditTarget: v }),

  selectedCustomerId: null,
  setSelectedCustomerId: (v) => set({ selectedCustomerId: v }),

  telegramConnectCustomerId: null,
  setTelegramConnectCustomerId: (v) => set({ telegramConnectCustomerId: v }),

  reminderTarget: null,
  setReminderTarget: (v) => set({ reminderTarget: v }),

  bulkReminderQueue: [],
  setBulkReminderQueue: (v) => set({ bulkReminderQueue: v }),

  creditView: 'customers',
  setCreditView: (v) => set({ creditView: v }),

  showSupplierForm: false,
  setShowSupplierForm: (v) => set({ showSupplierForm: v }),

  supplierEditTarget: null,
  setSupplierEditTarget: (v) => set({ supplierEditTarget: v }),

  supplierTransactionModal: null,
  setSupplierTransactionModal: (v) => set({ supplierTransactionModal: v }),

  supplierTransactionEditTarget: null,
  setSupplierTransactionEditTarget: (v) => set({ supplierTransactionEditTarget: v }),

  selectedSupplierId: null,
  setSelectedSupplierId: (v) => set({ selectedSupplierId: v }),

  editTarget: null,
  setEditTarget: (v) => set({ editTarget: v }),

  deleteTarget: null,
  setDeleteTarget: (v) => set({ deleteTarget: v }),

  showShareModal: false,
  setShowShareModal: (v) => set({ showShareModal: v }),
  shareText: '',
  setShareText: (v) => set({ shareText: v }),

  // ─── Voice (disabled, keep state for compat) ───
  voiceStep: null,
  setVoiceStep: (v) => set({ voiceStep: v }),
  voiceTranscript: '',
  setVoiceTranscript: (v) => set({ voiceTranscript: v }),
  voiceDetectedTotal: null,
  setVoiceDetectedTotal: (v) => set({ voiceDetectedTotal: v }),
  voiceItems: [],
  setVoiceItems: (v) => set({ voiceItems: v }),
  voiceConfidence: null,
  setVoiceConfidence: (v) => set({ voiceConfidence: v }),
  voiceProvider: null,
  setVoiceProvider: (v) => set({ voiceProvider: v }),
  voiceDraft: null,
  setVoiceDraft: (v) => set({ voiceDraft: v }),

  // ─── Toast ───
  toasts: [],
  addToast: (message, duration = 2400) => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, message, duration }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  // ─── Backup nudge ───
  backupNudgeDismissed: false,
  setBackupNudgeDismissed: (v) => set({ backupNudgeDismissed: v }),

  // ─── Telegram retry ───
  pendingTelegramCount: 0,
  setPendingTelegramCount: (v) => set({ pendingTelegramCount: v }),
  retryingTelegram: false,
  setRetryingTelegram: (v) => set({ retryingTelegram: v }),
}));

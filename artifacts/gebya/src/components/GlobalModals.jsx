import { Suspense } from 'react';
import { useLang } from '../context/LangContext';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { useShopStore } from '../stores/shopStore';
import { ModalFallback } from './Fallbacks';
import ShareModal from './ShareModal';
import { fmt } from '../utils/numformat';
import { CUSTOMER_TRANSACTION_TYPES } from '../utils/customerTransactionTypes';
import {
  TransactionForm, EditTransactionSheet, ReminderSheet,
  CustomerForm, CustomerTransactionSheet, CustomerTelegramConnectSheet,
  SupplierForm, SupplierTransactionSheet,
  VOICE_ENABLED, VoiceRecordScreen, VoiceResultScreen, VoiceFixScreen,
} from '../utils/lazyImports';
import { getSyncEngine } from '../utils/syncEngine';

export default function GlobalModals({
  // data
  enrichedCustomerSummaries,
  customerSummaries,
  supplierSummaries,
  activeCatalogEntries,
  recurringExpenses,
  currentActorLabel,
  enabledProviders,
  lastPayment,
  // handlers
  handleAddTransaction,
  handleSaveCustomerTransaction,
  handleDeleteCustomerTransaction,
  handleAddCustomer,
  handleSaveSupplier,
  handleSaveSupplierTransaction,
  handleCustomerReminderSent,
  handleToggleCustomerTelegramNotify,
  handleConfirmCustomerTelegramConnection,
  handleResendCustomerTelegramUpdate,
  handleSaveCatalogEntry,
  handleCustomQuickAmountsChange,
  handleAddCustomerInline,
  setRecurringExpenses,
  // voice
  voiceWorkspace,
  voiceContext,
  handleVoiceRepeatSale,
  handleVoiceUseItemShortcut,
  handleVoiceUseCustomerShortcut,
  handleVoiceSave,
  mergedVoiceDraft,
  recordVoiceTelemetry,
}) {
  const { lang, t } = useLang();
  const shopProfile = useShopStore(s => s.shopProfile);
  const customQuickAmounts = useShopStore(s => s.customQuickAmounts);
  const setAuthUser = useAuthStore(s => s.setUser);

  const showForm = useAppStore(s => s.showForm);
  const setShowForm = useAppStore(s => s.setShowForm);
  const showCustomerForm = useAppStore(s => s.showCustomerForm);
  const setShowCustomerForm = useAppStore(s => s.setShowCustomerForm);
  const customerEditTarget = useAppStore(s => s.customerEditTarget);
  const setCustomerEditTarget = useAppStore(s => s.setCustomerEditTarget);
  const customerTransactionModal = useAppStore(s => s.customerTransactionModal);
  const setCustomerTransactionModal = useAppStore(s => s.setCustomerTransactionModal);
  const customerTransactionEditTarget = useAppStore(s => s.customerTransactionEditTarget);
  const setCustomerTransactionEditTarget = useAppStore(s => s.setCustomerTransactionEditTarget);
  const telegramConnectCustomerId = useAppStore(s => s.telegramConnectCustomerId);
  const setTelegramConnectCustomerId = useAppStore(s => s.setTelegramConnectCustomerId);
  const showSupplierForm = useAppStore(s => s.showSupplierForm);
  const setShowSupplierForm = useAppStore(s => s.setShowSupplierForm);
  const supplierEditTarget = useAppStore(s => s.supplierEditTarget);
  const setSupplierEditTarget = useAppStore(s => s.setSupplierEditTarget);
  const supplierTransactionModal = useAppStore(s => s.supplierTransactionModal);
  const setSupplierTransactionModal = useAppStore(s => s.setSupplierTransactionModal);
  const supplierTransactionEditTarget = useAppStore(s => s.supplierTransactionEditTarget);
  const setSupplierTransactionEditTarget = useAppStore(s => s.setSupplierTransactionEditTarget);
  const selectedSupplierId = useAppStore(s => s.setSelectedSupplierId);
  const setSelectedSupplierId = useAppStore(s => s.setSelectedSupplierId);
  const reminderTarget = useAppStore(s => s.reminderTarget);
  const setReminderTarget = useAppStore(s => s.setReminderTarget);
  const bulkReminderQueue = useAppStore(s => s.bulkReminderQueue);
  const setBulkReminderQueue = useAppStore(s => s.setBulkReminderQueue);
  const showShareModal = useAppStore(s => s.showShareModal);
  const setShowShareModal = useAppStore(s => s.setShowShareModal);
  const shareText = useAppStore(s => s.shareText);
  const editTarget = useAppStore(s => s.editTarget);
  const setEditTarget = useAppStore(s => s.setEditTarget);
  const deleteTarget = useAppStore(s => s.deleteTarget);
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget);
  const voiceStep = useAppStore(s => s.voiceStep);
  const setVoiceStep = useAppStore(s => s.setVoiceStep);
  const voiceTranscript = useAppStore(s => s.voiceTranscript);
  const setVoiceTranscript = useAppStore(s => s.setVoiceTranscript);
  const voiceDetectedTotal = useAppStore(s => s.voiceDetectedTotal);
  const setVoiceDetectedTotal = useAppStore(s => s.setVoiceDetectedTotal);
  const voiceItems = useAppStore(s => s.voiceItems);
  const setVoiceItems = useAppStore(s => s.setVoiceItems);
  const voiceConfidence = useAppStore(s => s.voiceConfidence);
  const setVoiceConfidence = useAppStore(s => s.setVoiceConfidence);
  const voiceProvider = useAppStore(s => s.voiceProvider);
  const setVoiceProvider = useAppStore(s => s.setVoiceProvider);
  const setVoiceDraft = useAppStore(s => s.setVoiceDraft);
  const authChecked = useAuthStore(s => s.checked);
  const authUser = useAuthStore(s => s.user);

  const activeCustomerTransactionModal = customerTransactionModal
    ? enrichedCustomerSummaries.find(c => c.id === customerTransactionModal.customerId) || null
    : null;
  const activeSupplierTransactionModal = supplierTransactionModal
    ? supplierSummaries.find(s => s.id === supplierTransactionModal.supplierId) || null
    : null;
  const telegramConnectCustomer = telegramConnectCustomerId
    ? enrichedCustomerSummaries.find(c => c.id === telegramConnectCustomerId) || null
    : null;

  const typeEmoji = { sale: '💰', expense: '🛒', credit: '👥' };

  return (
    <>
      {showForm && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <TransactionForm
            type={showForm}
            onSave={handleAddTransaction}
            onDone={() => setShowForm(null)}
            actorLabel={currentActorLabel}
            enabledProviders={enabledProviders}
            catalogEntries={activeCatalogEntries}
            recurringExpenses={recurringExpenses}
            onRecurringChange={setRecurringExpenses}
            onSaveCatalogEntry={handleSaveCatalogEntry}
            customQuickAmounts={customQuickAmounts}
            onCustomQuickAmountsChange={handleCustomQuickAmountsChange}
            customers={customerSummaries}
            onAddCustomerInline={handleAddCustomerInline}
            initialPaymentType={(showForm === 'sale' || showForm === 'expense') ? lastPayment[showForm]?.type : undefined}
            initialPaymentProvider={(showForm === 'sale' || showForm === 'expense') ? lastPayment[showForm]?.provider : undefined}
            lastPaymentHistory={(showForm === 'sale' || showForm === 'expense') ? { bank: lastPayment[showForm]?.bankProvider || '', wallet: lastPayment[showForm]?.walletProvider || '' } : undefined}
          />
        </Suspense>
      )}

      {showCustomerForm && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerForm onSave={handleAddCustomer} onDone={() => setShowCustomerForm(false)} />
        </Suspense>
      )}

      {customerEditTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerForm
            existing={customerEditTarget}
            onSave={async (payload) => {
              const ok = await handleAddCustomer({ ...payload, id: customerEditTarget.id });
              if (ok) setCustomerEditTarget(null);
              return ok;
            }}
            onDone={() => setCustomerEditTarget(null)}
          />
        </Suspense>
      )}

      {customerTransactionModal && activeCustomerTransactionModal && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerTransactionSheet
            customer={activeCustomerTransactionModal}
            mode={customerTransactionModal.mode}
            initialAmount={customerTransactionModal.initialAmount}
            onSave={handleSaveCustomerTransaction}
            actorLabel={currentActorLabel}
            catalogEntries={activeCatalogEntries}
            onDone={() => setCustomerTransactionModal(null)}
          />
        </Suspense>
      )}

      {customerTransactionEditTarget?.transaction && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerTransactionSheet
            customer={enrichedCustomerSummaries.find(c => c.id === customerTransactionEditTarget.customerId) || null}
            mode={customerTransactionEditTarget.transaction.type}
            editingTransaction={customerTransactionEditTarget.transaction}
            onSave={handleSaveCustomerTransaction}
            actorLabel={currentActorLabel}
            catalogEntries={activeCatalogEntries}
            onDone={() => setCustomerTransactionEditTarget(null)}
          />
        </Suspense>
      )}

      {showSupplierForm && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierForm
            onSave={handleSaveSupplier}
            onDone={(saved) => { setShowSupplierForm(false); if (saved?.id) setSelectedSupplierId(saved.id); }}
          />
        </Suspense>
      )}

      {supplierEditTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierForm
            existing={supplierEditTarget}
            onSave={async (payload) => {
              const saved = await handleSaveSupplier({ ...payload, id: supplierEditTarget.id });
              if (saved) setSupplierEditTarget(null);
              return saved;
            }}
            onDone={() => setSupplierEditTarget(null)}
          />
        </Suspense>
      )}

      {supplierTransactionModal && activeSupplierTransactionModal && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierTransactionSheet
            supplier={activeSupplierTransactionModal}
            mode={supplierTransactionModal.mode}
            initialAmount={supplierTransactionModal.initialAmount}
            onSave={handleSaveSupplierTransaction}
            actorLabel={currentActorLabel}
            onDone={() => setSupplierTransactionModal(null)}
          />
        </Suspense>
      )}

      {supplierTransactionEditTarget?.transaction && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <SupplierTransactionSheet
            supplier={supplierSummaries.find(s => s.id === supplierTransactionEditTarget.supplierId) || null}
            mode={supplierTransactionEditTarget.transaction.type}
            editingTransaction={supplierTransactionEditTarget.transaction}
            onSave={handleSaveSupplierTransaction}
            actorLabel={currentActorLabel}
            onDone={() => setSupplierTransactionEditTarget(null)}
          />
        </Suspense>
      )}

      {telegramConnectCustomer && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <CustomerTelegramConnectSheet
            customer={telegramConnectCustomer}
            shopProfile={shopProfile}
            onSave={(payload) => handleConfirmCustomerTelegramConnection(telegramConnectCustomer, payload)}
            onResendUpdate={() => handleResendCustomerTelegramUpdate(telegramConnectCustomer)}
            onDone={() => setTelegramConnectCustomerId(null)}
          />
        </Suspense>
      )}

      {reminderTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <ReminderSheet
            customer={reminderTarget}
            shopName={shopProfile?.name}
            shopProfile={shopProfile}
            onClose={() => setReminderTarget(null)}
            onSent={handleCustomerReminderSent}
          />
        </Suspense>
      )}

      {editTarget && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <EditTransactionSheet
            transaction={editTarget}
            enabledProviders={enabledProviders}
            onUpdate={async (id, updates) => {
              // delegated to parent via prop or handled inside EditTransactionSheet
              setEditTarget(null);
            }}
            onClose={() => setEditTarget(null)}
          />
        </Suspense>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6 animate-fade">
          <div className="bg-white p-6 w-full max-w-sm animate-elastic" style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-lg)' }}>
            <div className="text-3xl text-center mb-3">{typeEmoji[deleteTarget.type]}</div>
            <h3 className="text-lg font-black text-gray-900 text-center mb-1 font-sans">{t.deleteEntry}</h3>
            <p className="text-sm text-gray-500 text-center mb-5" style={{ color: 'var(--color-text-muted)' }}>
              "{deleteTarget.item_name}" · {fmt(deleteTarget.amount || 0)} {lang === 'am' ? 'ብር' : 'birr'}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => { /* handled in AppInner via prop */ setDeleteTarget(null); }}
                className="w-full p-4 bg-red-500 text-white font-black min-h-[52px] press-scale"
                style={{ borderRadius: 'var(--radius-md)' }}
              >
                {t.delete}
              </button>
              <button onClick={() => setDeleteTarget(null)} className="w-full p-4 font-bold min-h-[52px] press-scale" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-text)', borderRadius: 'var(--radius-md)' }}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <ShareModal summary={shareText} telegram={shopProfile?.telegram} onClose={() => setShowShareModal(false)} t={t} />
      )}

      {/* Voice — disabled per D-027 */}
      {VOICE_ENABLED && voiceStep === 'record' && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <VoiceRecordScreen
            workspace={voiceWorkspace}
            voiceContext={voiceContext}
            onRepeatSale={handleVoiceRepeatSale}
            onUseItem={handleVoiceUseItemShortcut}
            onUseCustomer={handleVoiceUseCustomerShortcut}
            onTranscript={(transcript, detectedTotal, confidence, draft, provider) => {
              const newItem = { transcript, detectedTotal, draft };
              setVoiceItems(prev => [...prev, newItem]);
              setVoiceTranscript(transcript);
              setVoiceDetectedTotal(detectedTotal);
              setVoiceConfidence(confidence ?? null);
              setVoiceProvider(provider ?? null);
              setVoiceDraft(draft ?? null);
              recordVoiceTelemetry({ action: 'captured', transcript, provider: provider ?? null, draft: draft ?? null });
              setVoiceStep('result');
            }}
            onTypeInstead={() => {
              recordVoiceTelemetry({ action: 'type_instead' });
              setVoiceStep(null);
              setVoiceItems([]);
              setVoiceConfidence(null);
              setVoiceProvider(null);
              setVoiceDraft(null);
              setShowForm('sale');
            }}
          />
        </Suspense>
      )}

      {VOICE_ENABLED && voiceStep === 'result' && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <VoiceResultScreen
            transcript={voiceTranscript}
            detectedTotal={voiceDetectedTotal}
            items={voiceItems}
            draft={mergedVoiceDraft}
            workspace={voiceWorkspace}
            onRepeatSale={handleVoiceRepeatSale}
            onUseItem={handleVoiceUseItemShortcut}
            onUseCustomer={handleVoiceUseCustomerShortcut}
            onSave={handleVoiceSave}
            onFix={() => { recordVoiceTelemetry({ action: 'fix_opened' }); setVoiceStep('fix'); }}
            onAddAnother={() => setVoiceStep('record')}
            onReRecord={() => { setVoiceTranscript(''); setVoiceDetectedTotal(null); setVoiceItems([]); setVoiceConfidence(null); setVoiceProvider(null); setVoiceDraft(null); setVoiceStep('record'); }}
            onTypeInstead={() => { setVoiceStep(null); setVoiceItems([]); setShowForm('sale'); }}
          />
        </Suspense>
      )}

      {VOICE_ENABLED && voiceStep === 'fix' && (
        <Suspense fallback={<ModalFallback label={t.loading} />}>
          <VoiceFixScreen
            transcript={voiceTranscript}
            detectedTotal={voiceDetectedTotal}
            items={voiceItems}
            draft={mergedVoiceDraft}
            onSave={(data) => handleVoiceSave({ ...data, wasEdited: true })}
            onCancel={() => setVoiceStep('result')}
            enabledProviders={enabledProviders}
            lastProviderByType={{ bank: lastPayment.sale?.bankProvider || '', wallet: lastPayment.sale?.walletProvider || '' }}
          />
        </Suspense>
      )}
    </>
  );
}

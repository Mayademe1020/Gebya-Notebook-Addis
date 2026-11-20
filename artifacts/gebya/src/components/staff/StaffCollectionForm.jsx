import { useEffect, useRef } from 'react';
import React from 'react';
import { useStaffStore } from '../../stores/staffStore';
import { fmt } from '../../utils/numformat';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../hooks/useTranslation';
import ReconStatusBadge from './ReconStatusBadge';
import { fireToast } from '../Toast';
import { label } from '../../labels/index.js';

function CollectionFormFields({ variant, myTodaySales, store, alreadySubmitted, myLastSettlement, t, lang, activeStaffMemberId, lastSettlementPerStaff, setOpenCollectionSheet }) {
  const handleUpdateSubmission = () => {
    store.setStaffCollectCash(String(myLastSettlement.staff_reported_cash || ''));
    store.setStaffCollectTransfer(String(myLastSettlement.staff_reported_transfer || ''));
    store.setStaffCollectNote('');
  };

  const handleSubmit = () => {
    if (variant === 'mobile') {
      store.handleStaffSubmitCollection(activeStaffMemberId, lastSettlementPerStaff, lang);
      setOpenCollectionSheet(false);
    } else {
      store.handleStaffSubmitCollection(activeStaffMemberId, lastSettlementPerStaff, lang);
    }
  };

  return (
    <>
      {alreadySubmitted ? (
        <div>
          {myLastSettlement && (
            <div className="rounded-lg border px-3 py-2.5 mb-3" style={{ borderColor: 'var(--color-info-bg)', background: 'var(--color-bg-accent-blue)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black text-gray-700">{t('Submitted to owner', 'ለባለቤት አቀበረለክላው')}</span>
              </div>
              <div className="text-sm font-black" style={{ color: 'var(--color-primary)' }}>
                {t('Cash:', 'ጥሬ:')} {fmt(myLastSettlement.staff_reported_cash || 0)} {t('birr', 'ብር')}
                {myLastSettlement.staff_reported_transfer > 0 && (
                  <span className="ml-3">{t('Transfer:', 'ዝውውር:')} {fmt(myLastSettlement.staff_reported_transfer)} {t('birr', 'ብር')}</span>
                )}
              </div>
              {myLastSettlement.staff_note && (
                <div className="text-[10px] text-gray-500 mt-1">📝 {myLastSettlement.staff_note}</div>
              )}
            </div>
          )}
          {myLastSettlement?.reconciliation_status === 'disputed' && (
            <div className="rounded-lg border px-3 py-2.5 mb-3" style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-danger-bg)' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--color-danger-text)' }}>{t('Difference found by owner', 'ባለቤት ልዙድ አስተዋውሏል')}</div>
              {myLastSettlement.owner_note && <div className="text-[10px]" style={{ color: 'var(--color-danger)' }}>{myLastSettlement.owner_note}</div>}
            </div>
          )}
          {myLastSettlement?.reconciliation_status === 'finalized' && (
            <div className="rounded-lg border px-3 py-2.5 mb-3" style={{ borderColor: 'var(--color-success-border)', background: 'var(--color-success-bg)' }}>
              <div className="text-xs font-bold" style={{ color: 'var(--color-success-text)' }}>{t('✅ Settled by owner', '✅ ባለቤት ተስርቶ አደረገ')}</div>
            </div>
          )}
          <button
            onClick={handleUpdateSubmission}
            className="w-full py-2 rounded-xl text-xs font-bold text-gray-700"
            style={{ background: 'var(--color-border)' }}
          >
            {t('Update submission', 'አሻሽል')}
          </button>
        </div>
      ) : (
        <div>
          {myTodaySales && (
            <div className="rounded-lg border px-3 py-2 mb-3" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg-white)' }}>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">{t('Today recorded', 'ዛሬ የተመዘገበ')}</div>
              <div className="flex gap-3 text-xs font-bold" style={{ color: 'var(--color-primary)' }}>
                <span>{myTodaySales.count} {t('sales', 'ሽያጮች')}</span>
                <span>{t('Cash:', 'ጥሬ:')} {fmt(myTodaySales.cashTotal)} {t('birr', 'ብር')}</span>
                <span>{t('Transfer:', 'ዝውውር:')} {fmt(myTodaySales.transferTotal)} {t('birr', 'ብር')}</span>
              </div>
            </div>
          )}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t('Cash collected', 'የተሰበበ ጥሬ')}</label>
              <input type="number" inputMode="decimal"
                value={store.staffCollectCash}
                onChange={e => store.setStaffCollectCash(e.target.value)}
                placeholder="0"
                className="w-full mt-1 px-3 py-2.5 border-2 rounded-xl text-lg font-black text-center focus:outline-none"
                style={{ borderColor: 'var(--color-accent-amber)' }}
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t('Transfer', 'ዝውውር')}</label>
              <input type="number" inputMode="decimal"
                value={store.staffCollectTransfer}
                onChange={e => store.setStaffCollectTransfer(e.target.value)}
                placeholder="0"
                className="w-full mt-1 px-3 py-2.5 border-2 rounded-xl text-lg font-black text-center focus:outline-none"
                style={{ borderColor: 'var(--color-border)' }}
              />
            </div>
          </div>
          {myTodaySales && (
            <div className="flex gap-2 mb-3 flex-wrap">
              <button onClick={() => store.setStaffCollectCash(String(Math.round(myTodaySales.cashTotal)))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text)', border: 'none', cursor: 'pointer' }}>
                {fmt(myTodaySales.cashTotal)} {t('cash', 'ጥሬ')}
              </button>
              <button onClick={() => { store.setStaffCollectCash(String(Math.round(myTodaySales.cashTotal))); store.setStaffCollectTransfer(String(Math.round(myTodaySales.transferTotal))); }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text)', border: 'none', cursor: 'pointer' }}>
                {t('Full amount', 'ሙሉ መጅን')}
              </button>
            </div>
          )}
          <textarea value={store.staffCollectNote}
            onChange={e => store.setStaffCollectNote(e.target.value)}
            placeholder={t('Note (optional)', 'ማስታወሻ')}
            rows={2}
            className="w-full mb-3 px-3 py-2 border-2 rounded-xl text-xs focus:outline-none"
            style={{ borderColor: 'var(--color-border)' }}
          />
          <button
            onClick={handleSubmit}
            disabled={store.staffCollecting || (Number(store.staffCollectCash) === 0 && Number(store.staffCollectTransfer) === 0)}
            className="w-full py-3 rounded-xl text-sm font-bold min-h-[44px]"
            style={{
              background: (store.staffCollecting || (Number(store.staffCollectCash) === 0 && Number(store.staffCollectTransfer) === 0)) ? 'var(--color-bg-disabled)' : 'var(--color-primary)',
              color: (store.staffCollecting || (Number(store.staffCollectCash) === 0 && Number(store.staffCollectTransfer) === 0)) ? 'var(--color-text-soft)' : 'var(--color-bg-white)',
            }}
          >
            {store.staffCollecting ? '...' : t('Submit collection', 'ስብስቡን ላክ')}
          </button>
        </div>
      )}
    </>
  );
}

function StaffCollectionForm({
  activeStaffMemberId, activeStaff, lastSettlementPerStaff, lang,
  openCollectionSheet, setOpenCollectionSheet
}) {
  const store = useStaffStore();
  const isMobile = useIsMobile(768);
  const prevStatusRef = useRef(null);
  const t = useTranslation();

  if (activeStaffMemberId == null) return null;
  const me = activeStaff.find(m => String(m.id) === String(activeStaffMemberId));
  if (!me) return null;

  const myId = String(activeStaffMemberId);
  const myLastSettlement = lastSettlementPerStaff[myId];
  const alreadySubmitted = myLastSettlement?.reconciliation_status === 'staff_submitted'
    || myLastSettlement?.reconciliation_status === 'owner_reviewed'
    || myLastSettlement?.reconciliation_status === 'disputed';
  const myTodaySales = store.todayStaffSales[activeStaffMemberId];

  useEffect(() => {
    const currentStatus = myLastSettlement?.reconciliation_status;
    const prevStatus = prevStatusRef.current;

    if (prevStatus === 'staff_submitted' && currentStatus === 'finalized') {
      fireToast(
        label('staff.owner-accepted-collection-settled', lang),
        4000
      );
    } else if (prevStatus === 'staff_submitted' && currentStatus === 'disputed') {
      fireToast(
        label('staff.owner-flagged-a-difference', lang),
        4000
      );
    } else if (prevStatus === 'staff_submitted' && currentStatus === 'owner_reviewed') {
      fireToast(
        label('staff.owner-reviewed-your-submission', lang),
        3000
      );
    }

    prevStatusRef.current = currentStatus;
  }, [myLastSettlement?.reconciliation_status, lang]);

  function renderStatusBanners() {
    return (
      <>
        {myLastSettlement?.reconciliation_status === 'disputed' && (
          <div className="rounded-lg border px-3 py-2.5 mb-3" style={{ borderColor: 'var(--color-danger-border)', background: 'var(--color-danger-bg)' }}>
            <div className="text-xs font-bold" style={{ color: 'var(--color-danger-text)' }}>{t('Difference found by owner', 'ባለቤት ልዙድ አስተዋውሏል')}</div>
            {myLastSettlement.owner_note && <div className="text-[10px]" style={{ color: 'var(--color-danger)' }}>{myLastSettlement.owner_note}</div>}
          </div>
        )}
        {myLastSettlement?.reconciliation_status === 'finalized' && (
          <div className="rounded-lg border px-3 py-2.5 mb-3" style={{ borderColor: 'var(--color-success-border)', background: 'var(--color-success-bg)' }}>
            <div className="text-xs font-bold" style={{ color: 'var(--color-success-text)' }}>{t('✅ Settled by owner', '✅ ባለቤት ተስርቶ አደረገ')}</div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {!isMobile && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border-disabled)', background: 'var(--color-surface-subtle)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-alt)' }}>
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{t('My Collection', 'የእኔ ስብስብ')}</span>
            {myLastSettlement?.reconciliation_status && (
              <ReconStatusBadge status={myLastSettlement.reconciliation_status} lang={lang} />
            )}
          </div>
          <div className="px-4 py-3">
            <CollectionFormFields
              variant="desktop"
              myTodaySales={myTodaySales}
              store={store}
              alreadySubmitted={alreadySubmitted}
              myLastSettlement={myLastSettlement}
              t={t}
              lang={lang}
              activeStaffMemberId={activeStaffMemberId}
              lastSettlementPerStaff={lastSettlementPerStaff}
              setOpenCollectionSheet={setOpenCollectionSheet}
            />
          </div>
        </div>
      )}

      {isMobile && (
        <button
          onClick={() => setOpenCollectionSheet(!openCollectionSheet)}
          className="fixed bottom-4 left-4 right-4 z-40 py-4 rounded-2xl font-bold text-sm shadow-lg transition-all"
          style={{ background: 'var(--color-primary)', color: 'var(--color-bg-white)' }}
        >
          {myLastSettlement && alreadySubmitted ? t('Update Submission', 'አሻሽል') : t('My Collection', 'የእኔ ስብስብ')}
        </button>
      )}

      {isMobile && openCollectionSheet && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'var(--color-overlay)', backdropFilter: 'blur(2px)' }}
          onClick={() => setOpenCollectionSheet(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white px-4 pb-6 pt-2 max-h-[90vh] overflow-y-auto"
            style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-gray-300 mx-auto mb-3" />
            <div className="px-4 py-3 border-b flex items-center justify-between mb-4" style={{ borderColor: 'var(--color-border)' }}>
              <span className="text-sm font-bold text-gray-900">{t('My Collection', 'የእኔ ስብስብ')}</span>
              {myLastSettlement?.reconciliation_status && (
                <ReconStatusBadge status={myLastSettlement.reconciliation_status} lang={lang} />
              )}
            </div>
            <CollectionFormFields
              variant="mobile"
              myTodaySales={myTodaySales}
              store={store}
              alreadySubmitted={alreadySubmitted}
              myLastSettlement={myLastSettlement}
              t={t}
              lang={lang}
              activeStaffMemberId={activeStaffMemberId}
              lastSettlementPerStaff={lastSettlementPerStaff}
              setOpenCollectionSheet={setOpenCollectionSheet}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default React.memo(StaffCollectionForm);

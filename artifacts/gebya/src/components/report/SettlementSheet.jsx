import { useState, useEffect } from 'react';
import { User, Shield, CheckCircle, AlertCircle, FileText, Package, ChevronDown, Camera, X } from 'lucide-react';
import { saveSettlement, updateSettlement } from '../../db';
import { generateSettlementId, loadSettlementFromLocalStorage, saveSettlementDraft, clearSettlementDraft, createReconciliationEntry, getStaffTransactions } from '../../utils/settlementSelectors';
import { aggregateSettlementItems } from '../../utils/settlementItems';
import { createPhotoProof, normalizePhotos, MAX_PROOF_PHOTOS, canAddPhoto } from '../../utils/photoProof';
import { photoSizeBytes } from '../../utils/photoCapture';
import CameraCapture from '../CameraCapture';
import useCalculatedExpected from '../../utils/useCalculatedExpected';
import { fmt } from '../../utils/numformat';
import ReconStatusBadge from '../staff/ReconStatusBadge';
import { label } from '../../labels/index';

const C = {
  green: 'var(--color-primary)', greenLight: 'var(--color-success-bg)', greenBorder: 'var(--color-success-border)',
  amber: 'var(--color-accent-amber)', amberLight: 'var(--color-warning-bg)', amberBorder: 'var(--color-warning-border)',
  red: 'var(--color-danger)', redLight: 'var(--color-danger-bg)', redBorder: 'var(--color-danger-border)',
  blue: 'var(--color-info)', blueLight: 'var(--color-info-bg)', blueBorder: 'var(--color-info-border)',
  gray: 'var(--color-text-muted)', grayLight: 'var(--color-bg-active)', grayBorder: 'var(--color-bg-disabled)',
  text: 'var(--color-text)', textMuted: 'var(--color-text-muted)', textFaint: 'var(--color-text-soft)',
  radius: 8, radiusLg: 12, font: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

function Skeleton({ h = 12, w = '100%' }) {
  return <div style={{ height: h, width: w, background: 'var(--color-bg-hover)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />;
}

export default function SettlementSheet({ staff, existingSettlement, lang = 'en', onSaved, onCancel }) {
  const isReview = existingSettlement?.reconciliation_status === 'staff_submitted' || existingSettlement?.reconciliation_status === 'disputed';
  const isView = Boolean(existingSettlement) && !isReview;
  const isNew = !existingSettlement;

  const { expected, period, loading } = useCalculatedExpected(staff?.id, existingSettlement);
  const [actualCash, setActualCash] = useState('');
  const [actualTransfer, setActualTransfer] = useState('');
  const [adjustments, setAdjustments] = useState([]);
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('expense');
  const [notes, setNotes] = useState('');
  const [ownerReviewNote, setOwnerReviewNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [itemBreakdown, setItemBreakdown] = useState(null);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const [handoverPhotos, setHandoverPhotos] = useState([]);
  const [showCamera, setShowCamera] = useState(false);
  const [showDisputeInput, setShowDisputeInput] = useState(false);
  const [disputeInput, setDisputeInput] = useState('');
  const hasStaffReport = existingSettlement?.staff_reported_cash != null;
  const staffCash = Number(existingSettlement?.staff_reported_cash) || 0;
  const staffTransfer = Number(existingSettlement?.staff_reported_transfer) || 0;
  const staffTotal = staffCash + staffTransfer;
  const recLog = existingSettlement?.reconciliation_log || [];

  const t = (en, am) => lang === 'am' ? am : en;

  useEffect(() => {
    if (existingSettlement) {
      setActualCash(String(existingSettlement.actual_cash || ''));
      setActualTransfer(String(existingSettlement.actual_transfer || ''));
      setAdjustments(existingSettlement.adjustments || []);
      setNotes(existingSettlement.notes || '');
      setHandoverPhotos(normalizePhotos(existingSettlement.handover_photos));
    } else {
      setHandoverPhotos([]);
      const draft = loadSettlementFromLocalStorage(String(staff?.id));
      if (draft) {
        setActualCash(String(draft.actualCash || ''));
        setActualTransfer(String(draft.actualTransfer || ''));
        setAdjustments(draft.adjustments || []);
        setNotes(draft.notes || '');
      }
    }
  }, [staff?.id, existingSettlement]);

  // Phase 8e: handover photo capture (optional, max 3)
  const handleHandoverPhoto = (dataUrl) => {
    setShowCamera(false);
    if (!dataUrl || !canAddPhoto(handoverPhotos)) return;
    const proof = createPhotoProof(dataUrl);
    if (proof) setHandoverPhotos(prev => [...prev, proof]);
  };

  // Phase 8a: aggregate item lines for this settlement period (read-only)
  useEffect(() => {
    let cancelled = false;
    setItemBreakdown(null);
    const staffIdNum = Number(staff?.id);
    if (!staffIdNum || !period || !period.end || period.end <= (period.start || 0)) return undefined;
    (async () => {
      try {
        const txs = await getStaffTransactions(staffIdNum, period.start, period.end);
        if (cancelled) return;
        const sales = txs.filter(t => String(t.type || '').toLowerCase() === 'sale' && !t.is_credit && String(t.payment_type || '').toLowerCase() !== 'credit');
        const breakdown = aggregateSettlementItems(sales);
        const salesTotal = sales.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
        const simpleSales = sales.filter(tx => !Array.isArray(tx.items) || tx.items.length === 0).length;
        setItemBreakdown({ ...breakdown, salesTotal, simpleSales });
      } catch {
        if (!cancelled) setItemBreakdown({ items: [], totalQty: 0, totalAmount: 0, transactionCount: 0, salesTotal: 0, simpleSales: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, [staff?.id, period.start, period.end]);

  useEffect(() => {
    if (loading || isView) return;
    saveSettlementDraft(String(staff.id), {
      actualCash: Number(actualCash) || 0,
      actualTransfer: Number(actualTransfer) || 0,
      adjustments,
      notes,
    });
  }, [actualCash, actualTransfer, adjustments, notes, loading, isView]);

  const actualCashVal = Number(actualCash) || 0;
  const actualTransferVal = Number(actualTransfer) || 0;
  const actualTotal = actualCashVal + actualTransferVal;

  const adjTotal = adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const adjCash = adjustments.filter(a => a.type === 'expense' || a.type === 'credit_to_owner').reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const finalExpectedCash = expected.expectedCash - adjCash;
  const finalExpectedTotal = expected.expectedTotal - adjTotal;
  const cashVariance = actualCashVal - finalExpectedCash;
  const totalVariance = actualTotal - finalExpectedTotal;

  const handleAddAdjustment = () => {
    const amount = Number(adjustmentAmount) || 0;
    if (amount === 0 && !adjustmentNote.trim()) return;
    setAdjustments([...adjustments, {
      type: adjustmentType,
      amount,
      note: adjustmentNote.trim(),
      addedBy: 'owner',
      addedAt: new Date().toISOString(),
    }]);
    setAdjustmentAmount('');
    setAdjustmentNote('');
  };

  const handleRemoveAdjustment = (index) => {
    setAdjustments(adjustments.filter((_, i) => i !== index));
  };

  const handleMarkDisputed = async () => {
    const reason = disputeInput.trim();
    if (!reason) return;
    setSaving(true);
    setError('');
    try {
      const logEntry = createReconciliationEntry('owner', 'disputed', reason);
      await updateSettlement(existingSettlement.id, {
        reconciliation_status: 'disputed',
        status: 'reconciled',
        owner_note: reason,
        dispute_reason: reason,
        dispute_by: 'owner',
        dispute_at: Date.now(),
        reconciliation_log: [...recLog, logEntry],
        updated_at: Date.now(),
      });
      setShowDisputeInput(false);
      setDisputeInput('');
      onSaved?.();
    } catch {
      setError(t('Failed to mark as disputed', 'አከራካሪ አድርጎ ምልክት ማድረግ አልተሳካም'));
    }
    setSaving(false);
  };

  // Phase 8f: mark the dispute as seen (one-way — staff reads, cannot reply)
  useEffect(() => {
    const s = existingSettlement;
    if (!s || s.reconciliation_status !== 'disputed' || !s.dispute_reason || s.dispute_read_by_staff) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!cancelled) await updateSettlement(s.id, { dispute_read_by_staff: true, dispute_read_at: Date.now() });
      } catch { /* silent — read tracking is non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [existingSettlement?.id, existingSettlement?.reconciliation_status, existingSettlement?.dispute_reason, existingSettlement?.dispute_read_by_staff]);

  const handleSave = async () => {
    if (isView) return;
    if (actualCashVal === 0 && actualTransferVal === 0) {
      setError(t('Enter at least actual cash or transfer amount', 'እባክዎ ቢያንስ የጥሬ ገንዘብ ወይም የዝውውር መጠን ያስገቡ'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const staffIdNum = Number(staff.id);
      const now = Date.now();

      if (isReview) {
        const ownerNote = ownerReviewNote.trim();
        const isAccepted = actualCashVal === staffCash && actualTransferVal === staffTransfer;
        const wasDisputed = existingSettlement?.reconciliation_status === 'disputed';
        const logEntry = createReconciliationEntry(
          'owner',
          isAccepted ? 'accepted' : 'reviewed',
          wasDisputed
            ? (ownerNote || (isAccepted ? t('Dispute resolved — owner accepted', 'ክርክር ተፈቷል — ባለቤት ተቀብሏል') : t('Dispute resolved with adjustments', 'ክርክር በማስተካከል ተፈቷል')))
            : (ownerNote || (isAccepted ? t('Owner accepted staff report', 'ባለቤት የሰራተኛ ሪፖርት ተቀብሏል') : t('Owner reviewed with adjustments', 'ባለቤት በማስተካከል ተመልክቷል'))),
        );
        await updateSettlement(existingSettlement.id, {
          actual_cash: actualCashVal,
          actual_transfer: actualTransferVal,
          actual_total: actualCashVal + actualTransferVal,
          owner_confirmed_cash: actualCashVal,
          owner_confirmed_transfer: actualTransferVal,
          owner_note: ownerNote || null,
          reconciliation_status: isAccepted ? 'finalized' : 'owner_reviewed',
          final_expected_cash: finalExpectedCash,
          final_expected_total: finalExpectedTotal,
          final_variance: totalVariance,
          reconciliation_log: [...recLog, logEntry],
          status: 'reconciled',
          notes: notes.trim() || (ownerNote || null),
          handover_photos: handoverPhotos,
          reconciled_at: now,
          reconciled_by: staffIdNum,
          updated_at: now,
        });
      } else {
        await saveSettlement({
          settlement_id: generateSettlementId(),
          staff_id: staffIdNum,
          period_start: period.start,
          period_end: period.end,
          expected_cash: expected.expectedCash,
          actual_cash: actualCashVal,
          expected_transfer: expected.expectedTransfer,
          actual_transfer: actualTransferVal,
          expected_total: expected.expectedTotal,
          adjustments,
          final_expected_cash: finalExpectedCash,
          final_expected_total: finalExpectedTotal,
          final_variance: totalVariance,
          status: 'checked',
          notes: notes.trim(),
          handover_photos: handoverPhotos,
          settled_at: now,
          settled_by: staffIdNum,
          created_at: now,
          device_id: '',
        });
              clearSettlementDraft(String(staff.id));
      }
      onSaved?.(staff?.id);
    } catch {
      setError(t('Failed to save settlement', 'ማስተካከያ ማስቀመጥ አልተሳካም'));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <Skeleton h={18} w="60%" /><div style={{ height: 8 }} /><Skeleton h={12} w="80%" />
        </div>
        <Skeleton h={100} w="100%" /><div style={{ height: 12 }} />
        <Skeleton h={100} w="100%" />
      </div>
    );
  }

  const readOnly = isView;

  return (
    <div style={{
      background: 'var(--color-bg-active)', borderRadius: C.radiusLg, padding: 16, border: `1px solid ${C.grayBorder}`,
      fontFamily: C.font,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 900, color: C.text, margin: 0, lineHeight: 1.3 }}>
              {isNew
                ? t('Settle with', 'ከ') + ' ' + (staff.name || staff.displayName)
                : t('Settlement', 'ማስተካከያ') + ' — ' + (staff.name || staff.displayName)}
            </h3>
            <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>
              {period.start ? new Date(period.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : t('Start', 'መጀመሪያ')}
              {' → '}
              {new Date(period.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {existingSettlement && ` · ${new Date(existingSettlement.settled_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
            </p>
          </div>
          {existingSettlement && existingSettlement.reconciliation_status && (
            <ReconStatusBadge status={existingSettlement.reconciliation_status} lang={lang} />
          )}
        </div>
      </div>

      {/* Phase 8f: dispute banner (one-way — owner's reason shown to staff) */}
      {existingSettlement?.reconciliation_status === 'disputed' && (existingSettlement.dispute_reason || existingSettlement.owner_note) && (
        <div style={{ background: C.redLight, borderRadius: C.radius, padding: 12, marginBottom: 12, border: `1px solid ${C.redBorder}` }}>
          <p style={{ fontSize: 10, fontWeight: 900, color: C.red, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 5, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            <AlertCircle className="w-3.5 h-3.5" />
            {t('Disputed by owner', 'በባለቤት ተከራክሯል')}
            {existingSettlement.dispute_at && (
              <span style={{ fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: C.textMuted }}>
                · {new Date(existingSettlement.dispute_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </p>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.5 }}>
            {existingSettlement.dispute_reason || existingSettlement.owner_note}
          </p>
          <p style={{ fontSize: 9, color: C.textMuted, margin: '6px 0 0' }}>
            {t('The owner will review your settlement again to resolve this.', 'ባለቤቱ ይህንን ለመፍታት የእርስዎን ማስተካከያ እንደገና ይመለከታል።')}
          </p>
        </div>
      )}

      {/* Summary card */}
      <div style={{ background: 'var(--color-surface)', borderRadius: C.radius, padding: 14, marginBottom: 12, border: `1px solid ${C.grayBorder}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: t('Cash', 'ጥሬ'), value: fmt(expected.expectedCash), color: C.text },
            { label: t('Transfer', 'ዝውውር'), value: fmt(expected.expectedTransfer), color: C.text },
            { label: t('Total', 'ጠቅላላ'), value: `${fmt(expected.expectedTotal)} ETB`, color: C.green, bold: true },
          ].map((col, i) => (
            <div key={i} style={{ textAlign: i === 2 ? 'right' : 'left' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{col.label}</span>
              <p style={{ fontSize: i === 2 ? 20 : 17, fontWeight: col.bold ? 950 : 900, color: col.color, margin: '2px 0 0', lineHeight: 1.2 }}>{col.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 8a: Items sold breakdown (read-only, collapsible) */}
      {itemBreakdown && itemBreakdown.items.length > 0 && (
        <div style={{ background: 'var(--color-surface)', borderRadius: C.radius, marginBottom: 12, border: `1px solid ${C.grayBorder}`, overflow: 'hidden' }}>
          <button
            onClick={() => setItemsExpanded(v => !v)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: C.font }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: C.text }}>
              <Package className="w-3.5 h-3.5" style={{ color: C.amber }} />
              {t('Items sold', 'የተሸጡ ዕቃዎች')}
              <span style={{ fontWeight: 600, color: C.textMuted }}>
                · {itemBreakdown.items.length} {t('types', 'አይነት')} · {itemBreakdown.totalQty} {t('qty', 'ብዛት')}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.amber }}>{fmt(itemBreakdown.totalAmount)} ETB</span>
              <ChevronDown className="w-4 h-4" style={{ color: C.textMuted, transform: itemsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
            </span>
          </button>
          {itemsExpanded && (
            <div style={{ padding: '0 14px 12px' }}>
              {/* Column header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.grayBorder}` }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{t('Item', 'ዕቃ')}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'right' }}>{t('Qty × Price', 'ብዛት × ዋጋ')}</span>
                <span style={{ fontSize: 9, fontWeight: 800, color: C.textFaint, textTransform: 'uppercase', letterSpacing: '0.3px', textAlign: 'right', minWidth: 70 }}>{t('Total', 'ድምር')}</span>
              </div>
              {itemBreakdown.items.slice(0, 30).map((item, i) => (
                <div key={`${item.name}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, padding: '7px 0', borderBottom: `1px solid ${C.grayLight}`, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <span style={{ fontSize: 11, color: C.textMuted, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmt(item.qty)} × {fmt(item.unitPrice)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.text, textAlign: 'right', minWidth: 70 }}>{fmt(item.lineTotal)}</span>
                </div>
              ))}
              {itemBreakdown.items.length > 30 && (
                <p style={{ fontSize: 10, color: C.textMuted, margin: '8px 0 0', textAlign: 'center' }}>
                  {t('+ more items not shown', '+ ተጨማሪ ዕቃዎች አልታዩም')}
                </p>
              )}
              {/* Reconciliation footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: 4, borderTop: `1px solid ${C.grayBorder}` }}>
                <span style={{ fontSize: 10, color: C.textMuted }}>
                  {t('Itemized sales', 'ዝርዝር ሽያጭ')} {fmt(itemBreakdown.totalAmount)}
                  {itemBreakdown.simpleSales > 0 && ` · ${itemBreakdown.simpleSales} ${t('simple sale(s) without item details', 'ሽያጭ ያለ ዝርዝር')}`}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.textMuted }}>
                  {t('of', 'ከ')} {fmt(itemBreakdown.salesTotal)} ETB {t('sales total', 'ከሽያጭ ድምር')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Staff reported section (only in review mode) */}
      {hasStaffReport && (
        <div style={{ background: C.blueLight, borderRadius: C.radius, padding: 14, marginBottom: 12, border: `1px solid ${C.blueBorder}` }}>
          <p style={{ fontSize: 9, fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 10px' }}>
            <User className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {t('Staff reported', 'ሰራተኛ ያስረከበው')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.blue }}>{t('Cash', 'ጥሬ')}</span>
              <p style={{ fontSize: 18, fontWeight: 900, color: C.text, margin: '2px 0' }}>{fmt(staffCash)}</p>
            </div>
            <div>
              <span style={{ fontSize: 9, fontWeight: 700, color: C.blue }}>{t('Transfer', 'ዝውውር')}</span>
              <p style={{ fontSize: 18, fontWeight: 900, color: C.text, margin: '2px 0' }}>{fmt(staffTransfer)}</p>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${C.blueBorder}`, paddingTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.blue }}>{t('Total reported', 'ጠቅላላ ያስረከበው')}</span>
              <span style={{ fontSize: 16, fontWeight: 950, color: C.text }}>{fmt(staffTotal)} ETB</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 10, color: C.blue }}>{t('vs Expected', 'ከሚጠበቀው ጋር')}</span>
              <span style={{
                fontSize: 14, fontWeight: 900,
                color: staffTotal === expected.expectedTotal ? 'var(--color-success)' : C.red,
              }}>
                {staffTotal === expected.expectedTotal
                  ? `${t('Matched', 'ተመጣጣኚ')} ✓`
                  : `${staffTotal >= expected.expectedTotal ? '+' : ''}${fmt(staffTotal - expected.expectedTotal)} ETB`}
              </span>
            </div>
            {existingSettlement?.staff_note && (
              <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, borderTop: `1px solid ${C.blueBorder}`, paddingTop: 6 }}>
                <FileText className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: C.textFaint }} />
                {existingSettlement.staff_note}
              </div>
            )}
          </div>
          {isReview && (
            <button onClick={() => { setActualCash(String(staffCash)); setActualTransfer(String(staffTransfer)); }}
              style={{
                width: '100%', marginTop: 10, padding: '10px 0', borderRadius: C.radius,
                background: C.green, color: 'var(--color-bg-white)', border: 'none',
                fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px',
              }}
            >{t('Use staff amounts', 'የሰራተኛውን መጠን ተጠቀም')}</button>
          )}
        </div>
      )}

      {/* Dispute banner */}
      {existingSettlement?.reconciliation_status === 'disputed' && (
        <div style={{ background: C.redLight, borderRadius: C.radius, padding: 14, marginBottom: 12, border: `1px solid ${C.redBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <AlertCircle className="w-4 h-4" style={{ color: C.red }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: C.red }}>
              {t('Difference found', 'አከራካሪ ማስተካከያ')}
            </span>
          </div>
          <p style={{ fontSize: 11, color: C.red, margin: 0, lineHeight: 1.4 }}>
            {existingSettlement.owner_note || t('Owner identified a discrepancy. Review and resolve.', 'ባለቤት ልዩነት አስተውሏል። መርምረው ይፍቱ።')}
          </p>
        </div>
      )}

      {/* Actual inputs */}
      <div style={{ background: 'var(--color-surface)', borderRadius: C.radius, padding: 14, marginBottom: 12, border: `1px solid ${C.grayBorder}` }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 10px' }}>
          {isReview ? t('Owner confirmation', 'የባለቤት ማረጋገጫ') : t('Actual (counted)', 'ትክክለኛው')}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.text }}>{t('Cash in hand', 'በእጅ ጥሬ')}</span>
            <input type="number" inputMode="decimal" value={actualCash}
              onChange={e => setActualCash(e.target.value)}
              readOnly={readOnly}
              placeholder="0"
              style={{ minHeight: 44, border: `2px solid ${C.grayBorder}`, borderRadius: C.radius, padding: '6px 10px', fontSize: 18, fontWeight: 900, textAlign: 'center', outline: 'none', background: readOnly ? C.grayLight : 'var(--color-bg-white)', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
              onFocus={e => { if (!readOnly) e.target.style.borderColor = C.green; }}
              onBlur={e => { if (!readOnly) e.target.style.borderColor = C.grayBorder; }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.text }}>
              {t('Transfer', 'ዝውውር')}
              <span style={{ fontWeight: 400, color: C.textFaint }}> ({t('opt', 'አማራጭ')})</span>
            </span>
            <input type="number" inputMode="decimal" value={actualTransfer}
              onChange={e => setActualTransfer(e.target.value)}
              readOnly={readOnly}
              placeholder="0"
              style={{ minHeight: 44, border: `2px solid ${C.grayBorder}`, borderRadius: C.radius, padding: '6px 10px', fontSize: 18, fontWeight: 900, textAlign: 'center', outline: 'none', background: readOnly ? C.grayLight : 'var(--color-bg-white)', transition: 'border-color 0.15s', boxSizing: 'border-box' }}
              onFocus={e => { if (!readOnly) e.target.style.borderColor = C.green; }}
              onBlur={e => { if (!readOnly) e.target.style.borderColor = C.grayBorder; }}
            />
          </label>
        </div>
      </div>

      {/* Quick-fill chips for new settlements */}
      {isNew && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={() => { setActualCash(String(expected.expectedCash)); setActualTransfer(String(expected.expectedTransfer)); }}
            style={{ background: C.grayLight, color: C.text, border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => e.target.style.background = 'var(--color-bg-disabled)'}
            onMouseLeave={e => e.target.style.background = C.grayLight}
          >{t('Expected total', 'የሚጠበቅ ድምር')} {fmt(expected.expectedTotal)}</button>
          <button onClick={() => setActualCash(String(expected.expectedCash))}
            style={{ background: C.grayLight, color: C.text, border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'background 0.15s' }}
            onMouseEnter={e => e.target.style.background = 'var(--color-bg-disabled)'}
            onMouseLeave={e => e.target.style.background = C.grayLight}
          >{t('Expected cash', 'የሚጠበቅ ጥሬ')} {fmt(expected.expectedCash)}</button>
          {expected.expectedTransfer > 0 && (
            <button onClick={() => setActualTransfer(String(expected.expectedTransfer))}
              style={{ background: C.grayLight, color: C.text, border: 'none', borderRadius: 6, padding: '7px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.target.style.background = 'var(--color-bg-disabled)'}
              onMouseLeave={e => e.target.style.background = C.grayLight}
            >{t('Expected transfer', 'የሚጠበቅ ዝውውር')} {fmt(expected.expectedTransfer)}</button>
          )}
        </div>
      )}

      {/* Phase 8e: handover photos (optional, max 3) */}
      <div style={{ background: 'var(--color-surface)', borderRadius: C.radius, padding: 12, marginBottom: 12, border: `1px solid ${C.grayBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: handoverPhotos.length > 0 ? 10 : 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.3px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Camera className="w-3.5 h-3.5" />
            {t('Photo of handover', 'የማስረከቢያ ፎቶ')}
            <span style={{ fontWeight: 400, textTransform: 'none' }}>· {t('optional', 'አማራጭ')}</span>
          </span>
          {!readOnly && canAddPhoto(handoverPhotos) && (
            <button
              onClick={() => setShowCamera(true)}
              className="press-scale"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.blueLight, color: C.blue, border: `1.5px solid ${C.blueBorder}`, borderRadius: 999, padding: '6px 13px', fontSize: 11, fontWeight: 800, cursor: 'pointer', minHeight: 36 }}
            >
              <Camera className="w-3.5 h-3.5" />
              {t('Add photo', 'ፎቶ ያንሱ')}
            </button>
          )}
        </div>
        {handoverPhotos.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {handoverPhotos.map((photo) => (
              <div key={photo.id} style={{ position: 'relative' }}>
                <img
                  src={photo.dataUrl}
                  alt={t('Handover proof', 'የማስረከቢያ ማረጋገጫ')}
                  style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: C.radius, border: `1.5px solid ${C.grayBorder}`, display: 'block' }}
                />
                <span style={{ position: 'absolute', bottom: 3, left: 3, fontSize: 8, fontWeight: 700, color: C.text, background: 'rgba(255,255,255,0.85)', borderRadius: 4, padding: '1px 4px' }}>
                  {photoSizeBytes(photo.dataUrl)}
                </span>
                {!readOnly && (
                  <button
                    onClick={() => setHandoverPhotos(prev => prev.filter(p => p.id !== photo.id))}
                    aria-label={t('Remove photo', 'ፎቶ አስወግድ')}
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: '50%', background: C.red, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variance */}
      {(actualCashVal > 0 || actualTransferVal > 0) && (
        <div style={{
          background: totalVariance === 0 ? C.greenLight : C.redLight,
          borderRadius: C.radius, padding: 14, marginBottom: 12, textAlign: 'center',
          border: `1px solid ${totalVariance === 0 ? C.greenBorder : C.redBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
            {totalVariance === 0
              ? <CheckCircle className="w-4 h-4" style={{ color: 'var(--color-success)' }} />
              : <AlertCircle className="w-4 h-4" style={{ color: C.red }} />
            }
            <span style={{ fontSize: 9, fontWeight: 800, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              {t('Variance', 'ልዩነት')}
            </span>
          </div>
          <p style={{
            fontSize: 24, fontWeight: 950,
            color: totalVariance === 0 ? 'var(--color-success)' : C.red,
            margin: '4px 0 0',
          }}>
            {totalVariance === 0
              ? (label('reports.balanced', lang))
              : `${totalVariance >= 0 ? '+' : ''}${fmt(totalVariance)} ETB`
            }
          </p>
          {totalVariance !== 0 && (
            <p style={{ fontSize: 11, color: C.red, margin: '6px 0 0' }}>
              {t('Cash', 'ጥሬ')}: {cashVariance >= 0 ? '+' : ''}{fmt(cashVariance)} ·
              {t('Transfer', 'ዝውውር')}: {String(actualTransferVal - expected.expectedTransfer >= 0 ? '+' : '')}{fmt(actualTransferVal - expected.expectedTransfer)}
            </p>
          )}
        </div>
      )}

      {/* Adjustments */}
      <div style={{ background: 'var(--color-surface)', borderRadius: C.radius, padding: 14, marginBottom: 12, border: `1px solid ${C.grayBorder}` }}>
        <p style={{ fontSize: 9, fontWeight: 800, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 10px' }}>
          {t('Adjustments', 'ማስተካከያ')}
          {!readOnly && <span style={{ fontWeight: 400, color: C.textFaint, textTransform: 'none' }}> ({t('owner only', 'የባለቤት')})</span>}
        </p>

        {adjustments.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {adjustments.map((adj, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', background: C.grayLight, borderRadius: C.radius, marginBottom: 4,
                fontSize: 12,
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 800, color: C.text }}>
                    {adj.type === 'expense' ? t('Expense', 'ወጪ') :
                     adj.type === 'credit_to_owner' ? t('Credit to owner', 'ለባለቤት ክሬዲት') :
                     adj.type === 'sale' ? t('Sale', 'ሽያጭ') : t('Other', 'ሌላ')}
                  </span>
                  <span style={{ color: C.textMuted, marginLeft: 6 }}>
                    {adj.amount >= 0 ? '+' : ''}{fmt(adj.amount)} · {adj.note}
                  </span>
                </div>
                {!readOnly && (
                  <button onClick={() => handleRemoveAdjustment(i)}
                    style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }}
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {!readOnly && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={adjustmentType} onChange={e => setAdjustmentType(e.target.value)}
              style={{ fontSize: 11, border: `1px solid ${C.grayBorder}`, borderRadius: C.radius, padding: '7px 8px', outline: 'none', background: 'var(--color-surface)', minHeight: 34 }}
            >
              <option value="expense">{t('Expense', 'ወጪ')}</option>
              <option value="credit_to_owner">{t('Credit to owner', 'ለባለቤት ክሬዲት')}</option>
              <option value="sale">{t('Sale', 'ሽያጭ')}</option>
              <option value="other">{t('Other', 'ሌላ')}</option>
            </select>
            <input type="number" inputMode="decimal" value={adjustmentAmount}
              onChange={e => setAdjustmentAmount(e.target.value)} placeholder={t('Amount', 'መጠን')}
              style={{ fontSize: 11, border: `1px solid ${C.grayBorder}`, borderRadius: C.radius, padding: '7px 8px', width: 72, outline: 'none', minHeight: 34, boxSizing: 'border-box' }}
            />
            <input type="text" value={adjustmentNote}
              onChange={e => setAdjustmentNote(e.target.value)} placeholder={t('Note', 'ማስታወሻ')}
              style={{ fontSize: 11, border: `1px solid ${C.grayBorder}`, borderRadius: C.radius, padding: '7px 8px', flex: 1, minWidth: 80, outline: 'none', minHeight: 34, boxSizing: 'border-box' }}
            />
            <button onClick={handleAddAdjustment}
              style={{ background: C.green, color: 'var(--color-bg-white)', border: 'none', borderRadius: C.radius, padding: '7px 12px', fontSize: 14, fontWeight: 800, cursor: 'pointer', minHeight: 34, lineHeight: 1 }}
            >+</button>
          </div>
        )}
      </div>

      {/* Reconciliation timeline */}
      {recLog.length > 0 && (
        <div style={{ background: 'var(--color-surface)', borderRadius: C.radius, padding: 14, marginBottom: 12, border: `1px solid ${C.grayBorder}` }}>
          <p style={{ fontSize: 9, fontWeight: 800, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.3px', margin: '0 0 12px' }}>
            {t('Timeline', 'የእንቅስቃሴ ምዝግብ')}
          </p>
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            {recLog.map((entry, i) => {
              const isStaff = entry.actor === 'staff';
              const dotBg = isStaff ? C.blueLight : C.amberLight;
              const iconColor = isStaff ? C.blue : 'var(--color-warning)';
              const entryBg = isStaff ? C.blueLight : C.amberLight;
              return (
                <div key={i} style={{ position: 'relative', paddingBottom: i < recLog.length - 1 ? 16 : 0 }}>
                  {i < recLog.length - 1 && (
                    <div style={{ position: 'absolute', left: 11, top: 24, bottom: 0, width: 2, background: C.grayBorder }} />
                  )}
                  <div style={{
                    position: 'absolute', left: 0, top: 2,
                    width: 24, height: 24, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: dotBg,
                  }}>
                    {isStaff
                      ? <User className="w-3 h-3" style={{ color: iconColor }} />
                      : <Shield className="w-3 h-3" style={{ color: iconColor }} />
                    }
                  </div>
                  <div style={{ marginLeft: 12 }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 6, fontSize: 11,
                      background: entryBg,
                    }}>
                      <span style={{ fontWeight: 800, color: C.text }}>
                        {isStaff ? t('Staff', 'ሰራተኛ') : t('Owner', 'ባለቤት')}
                      </span>
                      <span style={{ color: C.textFaint }}>·</span>
                      <span style={{ fontWeight: 700, textTransform: 'capitalize', color: C.textMuted }}>
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {entry.note && (
                      <p style={{ margin: '4px 0 2px', fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>
                        {entry.note}
                      </p>
                    )}
                    <span style={{ fontSize: 9, color: C.textFaint }}>
                      {new Date(entry.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom: 10 }}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          readOnly={readOnly}
          placeholder={t('Notes (optional)', 'ማስታወሻ')}
          rows={2}
          style={{ width: '100%', border: `1px solid ${C.grayBorder}`, borderRadius: C.radius, padding: '8px 10px', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: readOnly ? C.grayLight : 'var(--color-bg-white)', fontFamily: C.font, lineHeight: 1.5 }}
        />
      </div>

      {/* Owner review note */}
      {isReview && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 10, fontWeight: 800, color: C.text, display: 'block', marginBottom: 4 }}>
            {t('Owner review note', 'የባለቤት ማስታወሻ')}
          </label>
          <textarea value={ownerReviewNote} onChange={e => setOwnerReviewNote(e.target.value)}
            placeholder={t('Any difference? Note it here', 'ልዩነት ካለ እዚህ ያስረዱ')}
            rows={2}
            style={{ width: '100%', border: `1px solid ${C.grayBorder}`, borderRadius: C.radius, padding: '8px 10px', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: C.font, lineHeight: 1.5 }}
          />
        </div>
      )}

      {/* Phase 8f: dispute reason input (required) */}
      {isReview && showDisputeInput && (
        <div style={{ background: C.redLight, borderRadius: C.radius, padding: 12, marginBottom: 10, border: `1px solid ${C.redBorder}` }}>
          <label style={{ fontSize: 10, fontWeight: 800, color: C.red, display: 'block', marginBottom: 4 }}>
            <AlertCircle className="w-3 h-3" style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
            {t('Why are you flagging this? (required — the staff will see this)', 'ለምን እንደሚከራከሩ ይጻፉ (አስፈላጊ — ሰራተኛው ያያል)')}
          </label>
          <textarea value={disputeInput} onChange={e => setDisputeInput(e.target.value)}
            autoFocus
            placeholder={t('e.g. Cash is 200 short', 'ለምሳሌ ጥሬ ገንዘብ በ200 አሳጥሯል')}
            rows={2}
            style={{ width: '100%', border: `1.5px solid ${C.redBorder}`, borderRadius: C.radius, padding: '8px 10px', fontSize: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: C.font, lineHeight: 1.5, background: 'var(--color-bg-white)' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => { setShowDisputeInput(false); setDisputeInput(''); }}
              style={{ flex: 1, minHeight: 44, border: `1px solid ${C.grayBorder}`, borderRadius: C.radius, background: 'var(--color-surface)', color: C.text, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
            >{t('Cancel', 'ተዉ')}</button>
            <button onClick={handleMarkDisputed} disabled={saving || !disputeInput.trim()}
              style={{ flex: 2, minHeight: 44, border: 'none', borderRadius: C.radius, background: saving || !disputeInput.trim() ? C.textFaint : C.red, color: 'var(--color-bg-white)', fontSize: 12, fontWeight: 800, cursor: saving || !disputeInput.trim() ? 'not-allowed' : 'pointer' }}
            >{saving ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Confirm dispute', 'አከራካሪ አድርግ')}</button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: C.redLight, borderRadius: C.radius, marginBottom: 10, border: `1px solid ${C.redBorder}` }}>
          <AlertCircle className="w-4 h-4" style={{ color: C.red, flexShrink: 0 }} />
          <span style={{ color: C.red, fontSize: 12, fontWeight: 700 }}>{error}</span>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel}
          style={{ flex: 1, minHeight: 44, border: `1px solid ${C.grayBorder}`, borderRadius: C.radius, background: 'var(--color-surface)', color: C.text, fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
        >{t('Back', 'ተመለስ')}</button>

        {isView && existingSettlement?.reconciliation_status === 'finalized' && (
          <button onClick={async () => {
            try {
              await updateSettlement(existingSettlement.id, {
                reconciliation_status: 'owner_reviewed',
                status: 'reconciled',
                updated_at: Date.now(),
              });
              onSaved?.();
            } catch { setError(t('Failed to re-open', 'እንደገና መክፈት አልተሳካም')); }
          }}
            style={{ flex: 1, minHeight: 44, border: `1px solid ${C.amberBorder}`, borderRadius: C.radius, background: C.amberLight, color: 'var(--color-warning)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
          >{t('Re-open', 'እንደገና ክፈት')}</button>
        )}

        {isReview && (
          <div style={{ display: 'flex', gap: 8, flex: 2 }}>
            {existingSettlement?.reconciliation_status === 'staff_submitted' && (
              <button onClick={() => { setShowDisputeInput(true); setDisputeInput(''); }} disabled={saving}
                style={{
                  flex: 1, minHeight: 44, border: `1px solid ${C.redBorder}`, borderRadius: C.radius,
                  background: C.redLight, color: C.red,
                  fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >{t('Flag difference', 'አከራካሪ')}</button>
            )}
            <button onClick={handleSave} disabled={saving || (actualCashVal === 0 && actualTransferVal === 0)}
              style={{
                flex: existingSettlement?.reconciliation_status === 'staff_submitted' ? 2 : 1, minHeight: 44, border: 'none', borderRadius: C.radius,
                background: saving ? C.textFaint : C.green,
                color: 'var(--color-bg-white)',
                fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
                letterSpacing: '0.3px',
              }}
            >{saving ? t('Saving...', 'በማስቀመጥ ላይ...') : (
              existingSettlement?.reconciliation_status === 'disputed'
                ? t('Resolve & Finalize', 'ፍታ እና ጨርስ')
                : t('Accept & Finalize', 'ተቀበል እና ጨርስ')
            )}</button>
          </div>
        )}

        {isNew && (
          <button onClick={handleSave} disabled={saving || (actualCashVal === 0 && actualTransferVal === 0)}
            style={{
              flex: 2, minHeight: 44, border: 'none', borderRadius: C.radius,
              background: saving ? C.textFaint : C.green,
              color: 'var(--color-bg-white)',
              fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: '0.3px',
            }}
          >{saving ? t('Saving...', 'በማስቀመጥ ላይ...') : t('Save Settlement', 'አስቀምጥ')}</button>
        )}
      </div>

      {/* Phase 8e: handover photo camera */}
      {showCamera && (
        <CameraCapture
          open={showCamera}
          onCapture={handleHandoverPhoto}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}

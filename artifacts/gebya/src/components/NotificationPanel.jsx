// NotificationPanel.jsx — compact modal sheet for notifications
//
// Replaces the full-page NotificationsTab as a bottom-sheet overlay.
// Deep-links to relevant tabs on tap based on entityType.
// Stale-while-revalidate: skips refetch if lastFetchedAt < 60s ago.

import { useEffect, useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { useNotificationsStore } from '../stores/notificationsStore';
import { useAppStore } from '../stores/appStore';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import db from '../db';
import { label as tr } from '../labels/index.js';

function timeAgo(dateStr, lang) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return tr('common.just-now', lang);
  if (mins < 60) return tr('common.m-ago', lang, mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tr('common.h-ago', lang, hours);
  const days = Math.floor(hours / 24);
  if (days < 7) return tr('common.d-ago', lang, days);
  return new Date(dateStr).toLocaleDateString(tr('common.en-us', lang), { month: 'short', day: 'numeric' });
}

const TYPE_ICONS = {
  sale: '💰',
  credit: '👥',
  supplier_payment: '🤝',
  supplier_purchase: '📦',
  staff_joined: '👤',
  rbac_violation: '⚠️',
  test: '🔔',
  expense: '🛒',
  payment: '✅',
  device_approval: '📱',
};

const TYPE_BG = {
  sale: 'var(--color-success-border)',
  credit: 'var(--color-warning-bg)',
  supplier_payment: 'var(--color-info-bg)',
  supplier_purchase: '#e0e7ff',
  staff_joined: '#f3e8ff',
  rbac_violation: 'var(--color-danger-bg)',
  test: 'var(--color-success-bg)',
  expense: '#fce7f3',
  payment: 'var(--color-success-bg)',
  device_approval: 'var(--color-info-bg)',
};

const TYPE_TEXT = {
  sale: 'var(--color-success-text)',
  credit: 'var(--color-warning)',
  supplier_payment: '#1e40af',
  supplier_purchase: '#3730a3',
  staff_joined: '#6b21a8',
  rbac_violation: 'var(--color-danger-text)',
  test: 'var(--color-success-text)',
  expense: '#9d174d',
  payment: 'var(--color-success-text)',
  device_approval: 'var(--color-info)',
};

const STALE_THRESHOLD_MS = 60_000; // 60 seconds

export default function NotificationPanel({ onClose }) {
  const { lang } = useLang();
  const {
    notifications, unreadCount, total, loading, loadingMore, fetched, lastFetchedAt,
    fetchNotifications, fetchMore, fetchUnreadCount, markAsRead, markAllAsRead,
  } = useNotificationsStore();

  const setActiveTab = useAppStore(s => s.setActiveTab);
  const setSelectedCustomerId = useAppStore(s => s.setSelectedCustomerId);
  const setSelectedSupplierId = useAppStore(s => s.setSelectedSupplierId);
  const setCreditView = useAppStore(s => s.setCreditView);

  // Fetch only if stale or never fetched
  useEffect(() => {
    const isStale = !lastFetchedAt || (Date.now() - lastFetchedAt) > STALE_THRESHOLD_MS;
    if (!fetched || isStale) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [fetched, lastFetchedAt, fetchNotifications, fetchUnreadCount]);

  const handleMarkAllRead = useCallback(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  const { isSupported: pushSupported, permission: pushPermission, isSubscribed, subscribe } = usePushNotifications();
  const [enablePushDismissed, setEnablePushDismissed] = useState(() => {
    try { return sessionStorage.getItem('gebya_push_prompt_dismissed') === '1'; } catch { return false; }
  });
  const showEnablePush = pushSupported && pushPermission !== 'denied' && !isSubscribed && !enablePushDismissed;

  const handleEnablePush = useCallback(async () => {
    await subscribe();
    setEnablePushDismissed(true);
    try { sessionStorage.setItem('gebya_push_prompt_dismissed', '1'); } catch {}
  }, [subscribe]);

  const handleDismissPush = useCallback(() => {
    setEnablePushDismissed(true);
    try { sessionStorage.setItem('gebya_push_prompt_dismissed', '1'); } catch {}
  }, []);

  // Deep-link navigation based on entityType + entityId resolution via Dexie
  const handleTap = useCallback(async (notif) => {
    if (!notif.read) markAsRead(notif.id);

    const entityType = notif.entityType;
    const entityId = notif.entityId;

    if (entityType === 'transactions') {
      setActiveTab('today');
      onClose();
    } else if (entityType === 'customer_transactions' && entityId) {
      // Resolve: notification.entityId → customer_transactions.id → customer_id
      try {
        const tx = await db.customer_transactions.get(Number(entityId));
        if (tx?.customer_id) {
          setSelectedCustomerId(tx.customer_id);
        }
      } catch { /* Dexie query failed — fallback to tab-level navigation */ }
      setCreditView('customers');
      setActiveTab('credit');
      onClose();
    } else if (entityType === 'supplier_transactions' && entityId) {
      // Resolve: notification.entityId → supplier_transactions.id → supplier_id
      try {
        const tx = await db.supplier_transactions.get(Number(entityId));
        if (tx?.supplier_id) {
          setSelectedSupplierId(tx.supplier_id);
        }
      } catch { /* Dexie query failed — fallback to tab-level navigation */ }
      setCreditView('suppliers');
      setActiveTab('credit');
      onClose();
    } else if (entityType === 'staff_members') {
      setActiveTab('settings');
      onClose();
    } else {
      onClose();
    }
  }, [markAsRead, setActiveTab, setSelectedCustomerId, setSelectedSupplierId, setCreditView, onClose]);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollHeight - scrollTop - clientHeight < 200 && !loadingMore && notifications.length < total) {
      fetchMore();
    }
  }, [loadingMore, notifications.length, total, fetchMore]);

  // Group by date
  const groups = [];
  let currentGroup = null;
  for (const n of notifications) {
    const d = new Date(n.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    let label;
    if (d.toDateString() === today.toDateString()) {
      label = tr('common.today', lang);
    } else if (d.toDateString() === yesterday.toDateString()) {
      label = tr('common.yesterday', lang);
    } else {
      label = d.toLocaleDateString(tr('common.en-us', lang), { month: 'short', day: 'numeric' });
    }
    if (!currentGroup || currentGroup.label !== label) {
      currentGroup = { label, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(n);
  }

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 60, background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-white w-full max-w-md max-h-[85vh] flex flex-col"
        style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-4 py-3 flex items-center justify-between gap-2"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
              {tr('common.notifications', lang)}
            </h2>
            {unreadCount > 0 && (
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {unreadCount} {tr('common.unread', lang)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] font-bold px-3 py-1.5 press-scale"
                style={{ color: 'var(--color-primary)', background: 'var(--color-success-bg)', borderRadius: 8 }}
              >
                {tr('common.mark-all-read', lang)}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={tr('common.close', lang)}
              className="press-scale flex items-center justify-center"
              style={{ minWidth: '36px', minHeight: '36px' }}
            >
              <X className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        </div>

        {/* Push enable banner */}
        {showEnablePush && (
          <div className="mx-4 mt-3 p-3 flex items-start gap-3 flex-shrink-0" style={{ background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 10 }}>
            <span className="text-lg flex-shrink-0">🔔</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold" style={{ color: 'var(--color-success-text)' }}>
                {tr('common.get-instant-alerts', lang)}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-success-text)' }}>
                {tr('common.know-when-staff-record-sales-even-when-the', lang)}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleEnablePush}
                  className="text-[11px] font-bold px-3 py-1.5 press-scale"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-bg-white)', borderRadius: 6 }}
                >
                  {tr('common.enable', lang)}
                </button>
                <button
                  onClick={handleDismissPush}
                  className="text-[11px] font-bold px-3 py-1.5"
                  style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
                >
                  {tr('common.no-thanks', lang)}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <span className="text-3xl mb-3">🔔</span>
              <p className="text-sm font-bold" style={{ color: 'var(--color-text-muted)' }}>
                {tr('common.no-notifications-yet', lang)}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-soft)' }}>
                {tr('common.you-ll-see-alerts-when-staff-record-sales', lang)}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label}>
                <div className="px-4 pt-3 pb-1">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-soft)' }}>
                    {group.label}
                  </h3>
                </div>
                {group.items.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => handleTap(notif)}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 press-scale"
                    style={{
                      background: notif.read ? 'transparent' : 'rgba(27,67,50,0.03)',
                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                    }}
                  >
                    <div
                      className="flex-shrink-0 flex items-center justify-center rounded-full"
                      style={{
                        width: 36, height: 36,
                        background: TYPE_BG[notif.type] || 'var(--color-bg-hover)',
                        fontSize: '16px',
                      }}
                    >
                      {TYPE_ICONS[notif.type] || '📌'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-bold truncate" style={{ color: 'var(--color-text)' }}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <span className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: 'var(--color-primary)' }} />
                        )}
                      </div>
                      <p className="text-[12px] mt-0.5 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                        {notif.body}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {notif.amount != null && (
                          <span className="text-[11px] font-bold" style={{ color: TYPE_TEXT[notif.type] || 'var(--color-text-muted)' }}>
                            {fmt(notif.amount)} {tr('common.birr', lang)}
                          </span>
                        )}
                        <span className="text-[10px]" style={{ color: 'var(--color-text-soft)' }}>
                          {timeAgo(notif.createdAt, lang)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { Bell, BellOff, Moon, Sun } from 'lucide-react';
import { fireToast } from '../Toast';
import { getAuthToken } from '../../utils/syncEngine';
import { label } from '../../labels/index.js';

const NOTIFICATION_TYPES = [
  { key: 'sale', label: { en: 'Sales', am: 'ሽያጭ' }, icon: '💰' },
  { key: 'credit', label: { en: 'Credit Given', am: 'ተሰጠ ብር' }, icon: '👥' },
  { key: 'payment', label: { en: 'Payments Received', am: 'ክፍያ ተቀባይ' }, icon: '✅' },
  { key: 'supplier_payment', label: { en: 'Supplier Payments', am: 'የአቅራቢያ ክፍያ' }, icon: '🤝' },
  { key: 'supplier_purchase', label: { en: 'Supplier Purchases', am: 'የአቅራቢያ ግዢ' }, icon: '📦' },
  { key: 'expense', label: { en: 'Expenses', am: 'ወጪ' }, icon: '🛒' },
  { key: 'staff_joined', label: { en: 'Staff Joined', am: 'ሰራተኛ ተቀላቅሏል' }, icon: '👤' },
  { key: 'rbac_violation', label: { en: 'Security Alerts', am: 'የደህንነት ማስጠንቂያ' }, icon: '⚠️' },
  { key: 'overdue_alert', label: { en: 'Overdue Payments', am: 'የጊዜ ያለፈ ክፍያ' }, icon: '⏰' },
  { key: 'device_approval', label: { en: 'Device Approval', am: 'የስልክ ማጽደቅ' }, icon: '📱' },
  { key: 'announcement', label: { en: 'Announcements', am: 'ማስታወቂያ' }, icon: '📣' },
  { key: 'support_reply', label: { en: 'Support Replies', am: 'የድጋፍ መልስ' }, icon: '💬' },
  { key: 'staff_submitted_collection', label: { en: 'Staff Submissions', am: 'የሰራተኛ ስብስብ' }, icon: '📋' },
];

function NotificationPrefsRow({ type, prefs, onChange, lang }) {
  const handleChange = (channel, value) => {
    onChange(type.key, { ...prefs, [channel]: value });
  };

  return (
    <div className="flex items-center gap-3 py-2.5" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
      <span className="text-base flex-shrink-0">{type.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold" style={{ color: 'var(--color-text)' }}>
          {type.label[lang] || type.label.en}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* In-app toggle */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--color-text-soft)' }}>
            {label('settings-data.app', lang)}
          </span>
          <label className="toggle-pill">
            <input
              type="checkbox"
              checked={prefs.inApp}
              onChange={(e) => handleChange('inApp', e.target.checked)}
              aria-label={`${type.label.en} in-app`}
            />
            <span className="toggle-slider" />
          </label>
        </div>
        {/* Push toggle */}
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[9px] font-bold uppercase" style={{ color: 'var(--color-text-soft)' }}>
            Push
          </span>
          <label className="toggle-pill">
            <input
              type="checkbox"
              checked={prefs.push}
              onChange={(e) => handleChange('push', e.target.checked)}
              aria-label={`${type.label.en} push`}
            />
            <span className="toggle-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}

function QuietHoursRow({ startTime, endTime, onChange, lang }) {
  return (
    <div className="py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Moon className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>
          {label('settings-data.quiet-hours', lang)}
        </span>
      </div>
      <p className="text-[11px] mb-2" style={{ color: 'var(--color-text-muted)' }}>
        {label('settings-data.push-notifications-silenced-during-this', lang)}
      </p>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-text-soft)' }}>
            {label('settings-data.from', lang)}
          </label>
          <input
            type="time"
            value={startTime || ''}
            onChange={(e) => onChange({ startTime: e.target.value, endTime })}
            className="w-full mt-1 px-2 py-1.5 text-xs rounded-lg border"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </div>
        <span className="text-xs mt-4" style={{ color: 'var(--color-text-muted)' }}>—</span>
        <div className="flex-1">
          <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-text-soft)' }}>
            {label('settings-data.until', lang)}
          </label>
          <input
            type="time"
            value={endTime || ''}
            onChange={(e) => onChange({ startTime, endTime: e.target.value })}
            className="w-full mt-1 px-2 py-1.5 text-xs rounded-lg border"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </div>
      </div>
    </div>
  );
}

export default function NotificationPreferences({ lang }) {
  const [preferences, setPreferences] = useState({});
  const [quietHoursStart, setQuietHoursStart] = useState(null);
  const [quietHoursEnd, setQuietHoursEnd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getAuthToken();
      if (!token) {
        setLoading(false);
        fireToast(label('settings-data.sign-in-required-to-load-preferences', lang), 3000);
        return;
      }

      const res = await fetch('/api/notifications/preferences', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setPreferences(data.preferences || {});
      setQuietHoursStart(data.quietHoursStart);
      setQuietHoursEnd(data.quietHoursEnd);
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPreferences(); }, [loadPreferences]);

  const handleTypeChange = useCallback(async (typeKey, newPrefs) => {
    const updated = { ...preferences, [typeKey]: newPrefs };
    setPreferences(updated);

    // Auto-save
    try {
      setSaving(true);
      const token = await getAuthToken();
      if (!token) {
        fireToast(label('settings-data.sign-in-to-save-preferences', lang), 3000);
        return;
      }

      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ preferences: updated }),
      });
    } catch (err) {
      console.error('Failed to save preference:', err);
      fireToast(label('settings-data.failed-to-save', lang), 2500);
    } finally {
      setSaving(false);
    }
  }, [preferences, lang]);

  const handleQuietHoursChange = useCallback(async ({ startTime, endTime }) => {
    setQuietHoursStart(startTime);
    setQuietHoursEnd(endTime);

    try {
      setSaving(true);
      const token = await getAuthToken();
      if (!token) {
        fireToast(label('settings-data.sign-in-to-save-quiet-hours', lang), 3000);
        return;
      }

      await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quietHoursStart: startTime, quietHoursEnd: endTime }),
      });
    } catch (err) {
      console.error('Failed to save quiet hours:', err);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleReset = useCallback(async () => {
    try {
      setSaving(true);
      const token = await getAuthToken();
      if (!token) {
        fireToast(label('settings-data.sign-in-to-reset-preferences', lang), 3000);
        return;
      }

      await fetch('/api/notifications/preferences/reset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadPreferences();
      fireToast(label('settings-data.reset-to-defaults', lang), 2000);
    } catch (err) {
      console.error('Failed to reset preferences:', err);
    } finally {
      setSaving(false);
    }
  }, [loadPreferences, lang]);

  if (loading) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {label('settings-data.notification-preferences', lang)}
          </span>
        </div>
        <div className="card-body flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
          {label('settings-data.notification-preferences', lang)}
        </span>
      </div>
      <div className="card-body">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
              {label('settings-data.what-to-receive', lang)}
            </span>
          </div>
          {saving && (
            <span className="text-[10px]" style={{ color: 'var(--color-text-soft)' }}>
              {label('settings-data.saving', lang)}
            </span>
          )}
        </div>

        {/* Column labels */}
        <div className="flex items-center gap-3 pb-2 mb-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex-1" />
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-[9px] font-bold uppercase w-8 text-center" style={{ color: 'var(--color-text-soft)' }}>
              {label('settings-data.app', lang)}
            </span>
            <span className="text-[9px] font-bold uppercase w-8 text-center" style={{ color: 'var(--color-text-soft)' }}>
              Push
            </span>
          </div>
        </div>

        {/* Notification type rows */}
        {NOTIFICATION_TYPES.map((type) => (
          <NotificationPrefsRow
            key={type.key}
            type={type}
            prefs={preferences[type.key] || { inApp: true, push: true }}
            onChange={handleTypeChange}
            lang={lang}
          />
        ))}

        {/* Quiet hours */}
        <QuietHoursRow
          startTime={quietHoursStart}
          endTime={quietHoursEnd}
          onChange={handleQuietHoursChange}
          lang={lang}
        />

        {/* Reset button */}
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={handleReset}
            disabled={saving}
            className="text-[11px] font-bold px-3 py-1.5"
            style={{ color: 'var(--color-text-muted)', background: 'transparent', border: 'none' }}
          >
            {label('settings-data.reset-to-defaults-2', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

export const OWNER_ALERT_MODES = {
  ALL: 'all',
  HIGH_VALUE: 'high_value',
  SUMMARY: 'summary',
  NONE: 'none',
};

export const DEFAULT_OWNER_ALERT_SETTINGS = {
  mode: OWNER_ALERT_MODES.HIGH_VALUE,
  threshold_amount: 5000,
  summary_time: '20:00',
};

export function normalizeOwnerAlertSettings(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = null;
    }
  }

  const mode = Object.values(OWNER_ALERT_MODES).includes(parsed?.mode)
    ? parsed.mode
    : DEFAULT_OWNER_ALERT_SETTINGS.mode;
  const threshold = Number(parsed?.threshold_amount);
  const summaryTime = /^\d{2}:\d{2}$/.test(String(parsed?.summary_time || ''))
    ? parsed.summary_time
    : DEFAULT_OWNER_ALERT_SETTINGS.summary_time;

  return {
    mode,
    threshold_amount: Number.isFinite(threshold) && threshold >= 0
      ? threshold
      : DEFAULT_OWNER_ALERT_SETTINGS.threshold_amount,
    summary_time: summaryTime,
  };
}

export function shouldCreateOwnerSaleAlert(transaction, settings) {
  if (!transaction || transaction.type !== 'sale') return false;
  const normalized = normalizeOwnerAlertSettings(settings);
  if (normalized.mode === OWNER_ALERT_MODES.NONE || normalized.mode === OWNER_ALERT_MODES.SUMMARY) return false;
  if (normalized.mode === OWNER_ALERT_MODES.ALL) return true;
  return Number(transaction.amount || 0) >= Number(normalized.threshold_amount || 0);
}

export function buildOwnerSaleAlert(transaction, settings) {
  const normalized = normalizeOwnerAlertSettings(settings);
  return {
    type: 'sale',
    status: 'unread',
    transaction_id: transaction.id,
    amount: Number(transaction.amount || 0),
    item_name: transaction.item_name || null,
    item_code: transaction.item_code || null,
    actor_name_snapshot: transaction.actor_name_snapshot || 'Owner',
    actor_staff_member_id: transaction.actor_staff_member_id || null,
    threshold_amount: normalized.mode === OWNER_ALERT_MODES.HIGH_VALUE
      ? Number(normalized.threshold_amount || 0)
      : null,
    created_at: Date.now(),
  };
}

export function sortOwnerAlerts(alerts = []) {
  return alerts.slice().sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
}

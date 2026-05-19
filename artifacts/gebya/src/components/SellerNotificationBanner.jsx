import { useState, useEffect } from 'react';
import { AlertCircle, TrendingUp, Flame, Clock, X } from 'lucide-react';
import { useLang } from '../context/LangContext';

const P = {
  overdueBg: '#fef2f2',
  overdueBorder: '#fca5a5',
  overdueText: '#991b1b',
  followUpBg: '#fffbeb',
  followUpBorder: '#fde68a',
  followUpText: '#92400e',
  milestoneBg: '#f0fdf4',
  milestoneBorder: '#86efac',
  milestoneText: '#166534',
  streakBg: '#fffbeb',
  streakBorder: '#fcd34d',
  streakText: '#92400e',
};

function getOverdueCount(customerSummaries) {
  let count = 0;
  for (const c of customerSummaries) {
    if (c.balance <= 0) continue;
    if (c.collection_status?.key === 'overdue') count++;
  }
  return count;
}

function getFollowUpCount(customerSummaries) {
  let count = 0;
  for (const c of customerSummaries) {
    if (c.balance <= 0) continue;
    if (c.needs_follow_up === true) count++;
  }
  return count;
}

export default function SellerNotificationBanner({
  customerSummaries,
  todaySalesCount,
  usageStats,
  onNavigateToDubie,
  onNavigateToFollowUp,
}) {
  const { t } = useLang();
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    const today = new Date().toDateString();
    const stored = sessionStorage.getItem('gebya_notif_dismissed');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.date === today) setDismissed(parsed.type);
      } catch { /* ignore */ }
    }
  }, []);

  const dismiss = (type) => {
    const today = new Date().toDateString();
    sessionStorage.setItem('gebya_notif_dismissed', JSON.stringify({ date: today, type }));
    setDismissed(type);
  };

  const overdueCount = getOverdueCount(customerSummaries || []);
  const followUpCount = getFollowUpCount(customerSummaries || []);
  const isFirstSale = todaySalesCount === 1;
  const streak = usageStats?.streak || 0;

  const notifications = [];

  if (overdueCount > 0 && dismissed !== 'overdue') {
    notifications.push({
      type: 'overdue',
      icon: AlertCircle,
      bg: P.overdueBg,
      border: P.overdueBorder,
      text: P.overdueText,
      title: t.notifOverdueTitle,
      body: `${overdueCount} ${t.notifOverdueBody}`,
      action: t.notifOverdueAction,
      onAction: onNavigateToDubie,
    });
  }

  if (followUpCount > 0 && dismissed !== 'followup') {
    notifications.push({
      type: 'followup',
      icon: Clock,
      bg: P.followUpBg,
      border: P.followUpBorder,
      text: P.followUpText,
      title: t.notifFollowUpTitle,
      body: `${followUpCount} ${t.notifFollowUpBody}`,
      action: t.notifFollowUpAction,
      onAction: onNavigateToFollowUp || onNavigateToDubie,
    });
  }

  if (isFirstSale && dismissed !== 'milestone') {
    notifications.push({
      type: 'milestone',
      icon: TrendingUp,
      bg: P.milestoneBg,
      border: P.milestoneBorder,
      text: P.milestoneText,
      body: t.notifFirstSale,
    });
  }

  if (streak >= 3 && dismissed !== 'streak') {
    notifications.push({
      type: 'streak',
      icon: Flame,
      bg: P.streakBg,
      border: P.streakBorder,
      text: P.streakText,
      body: t.notifStreak.replace('{n}', streak),
    });
  }

  if (notifications.length === 0) return null;

  return (
    <div className="space-y-2 px-1">
      {notifications.map((n) => {
        const Icon = n.icon;
        return (
          <div
            key={n.type}
            className="flex items-start gap-3 p-3 animate-elastic"
            style={{
              background: n.bg,
              border: `1.5px solid ${n.border}`,
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: n.text }} />
            <div className="flex-1 min-w-0">
              {n.title && (
                <p className="text-xs font-black" style={{ color: n.text }}>{n.title}</p>
              )}
              <p className="text-xs font-semibold" style={{ color: n.text }}>{n.body}</p>
              {n.action && n.onAction && (
                <button
                  onClick={n.onAction}
                  className="mt-1 text-xs font-black underline press-scale"
                  style={{ color: n.text }}
                >
                  {n.action}
                </button>
              )}
            </div>
            <button
              onClick={() => dismiss(n.type)}
              className="flex-shrink-0 p-1 press-scale"
              aria-label={t.notifDismiss}
            >
              <X className="w-4 h-4" style={{ color: n.text, opacity: 0.5 }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// CustomerTelegramConnectSheet.jsx — Commit T2 redesign (Q4).
//
// Goal: fit the Telegram linking flow on a 320px screen without endless
// scroll. Previous version stacked QR + URL + 4 buttons + manual fallback
// all expanded by default. New design:
//   • Compact status pill (one row)
//   • ONE big primary button: "Open Telegram & Link"
//   • QR code collapsed by default, expandable for in-person sharing
//   • Refresh smaller, secondary
//   • Manual fallback collapsed by default

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2, Copy, MessageCircle, QrCode, RefreshCcw, Send,
  ChevronDown, ChevronUp, X, AlertTriangle,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fireToast } from './Toast';
import { useLang } from '../context/LangContext';
import { buildCustomerConnectLink, normalizeTelegram } from '../utils/customerTelegram';
import {
  createTelegramLinkSession,
  fetchTelegramBotStatus,
  fetchTelegramLinkSession,
} from '../utils/telegramBotClient';

function isSlowConnection() {
  if (typeof navigator === 'undefined') return false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return Boolean(connection?.saveData) || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
}

const FRONTEND_BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim();

function CustomerTelegramConnectSheet({ customer, shopProfile, onSave, onDone, onResendUpdate }) {
  const { t, lang } = useLang();
  const frontendBotUsername = FRONTEND_BOT_USERNAME || null;
  const [manualTelegram, setManualTelegram] = useState(customer?.telegram_username || '');
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [botStatus, setBotStatus] = useState({ configured: Boolean(frontendBotUsername), bot_username: frontendBotUsername });
  const [linkSession, setLinkSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [telegramServiceAvailable, setTelegramServiceAvailable] = useState(true);
  const autoSavedChatRef = useRef(customer?.telegram_chat_id || null);

  // T2: collapsibles default to closed for compact first impression
  const [showQR, setShowQR] = useState(false);
  const [showManualFallback, setShowManualFallback] = useState(false);

  const safeBotStatus = botStatus && typeof botStatus === 'object'
    ? botStatus
    : { configured: Boolean(frontendBotUsername), bot_username: frontendBotUsername };
  const normalizedTelegram = normalizeTelegram(manualTelegram);
  const telegramValid = !manualTelegram.trim() || !!normalizedTelegram;
  const hasLinkedBorrower = Boolean(customer?.telegram_chat_id || linkSession?.chat_id);
  const hasPendingLink = !hasLinkedBorrower && Boolean(customer?.telegram_link_requested_at || linkSession?.requested_at);
  const slowConnection = isSlowConnection();
  const canShowInviteTools = Boolean(customer?.telegram_link_token);
  const linkingAvailable = (telegramServiceAvailable && safeBotStatus.configured) || (slowConnection && canShowInviteTools);
  const detectedChatId = linkSession?.chat_id || null;
  const detectedUsername = linkSession?.telegram_username || null;

  const inviteLink = useMemo(
    () => buildCustomerConnectLink({
      botUsername: safeBotStatus.bot_username,
      shopTelegram: shopProfile?.telegram,
      shopName: shopProfile?.name,
      customerName: customer?.display_name,
      token: customer?.telegram_link_token,
    }),
    [safeBotStatus.bot_username, customer?.display_name, customer?.telegram_link_token, shopProfile?.name, shopProfile?.telegram]
  );

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!navigator.onLine) {
        setTelegramServiceAvailable(false);
        setLoadingSession(false);
        return;
      }

      if (slowConnection) {
        setLoadingSession(false);
        return;
      }

      try {
        const status = await fetchTelegramBotStatus().catch(() => null);
        if (!active) return;
        if (status && typeof status === 'object') {
          setBotStatus({
            ...status,
            configured: Boolean(status.configured || frontendBotUsername),
            bot_username: status.bot_username || frontendBotUsername,
          });
          setTelegramServiceAvailable(true);
        } else {
          setBotStatus({ configured: Boolean(frontendBotUsername), bot_username: frontendBotUsername });
          setTelegramServiceAvailable(false);
        }

        if (!customer?.telegram_link_token) {
          setLoadingSession(false);
          return;
        }

        const session = await createTelegramLinkSession({
          token: customer.telegram_link_token,
          customerId: customer.id,
          customerName: customer.display_name,
          shopName: shopProfile?.name || 'Gebya',
          currentBalance: Number(customer?.balance || 0),
          updatesEnabled: !!customer?.telegram_notify_enabled,
        }).catch(() => null);

        if (!active) return;
        if (session) {
          setLinkSession(session);
          if (session.bot_username) {
            setBotStatus(prev => ({ ...prev, bot_username: session.bot_username, configured: true }));
          }
        } else {
          setTelegramServiceAvailable(false);
        }
      } catch (error) {
        if (active) {
          setTelegramServiceAvailable(false);
        }
      } finally {
        if (active) setLoadingSession(false);
      }
    }

    bootstrap();
    return () => { active = false; };
  }, [customer?.id, customer?.display_name, customer?.telegram_link_token, customer?.telegram_link_requested_at, customer?.balance, customer?.telegram_notify_enabled, shopProfile?.name, slowConnection]);

  // Poll for link completion when we've sent a link but not yet linked
  useEffect(() => {
    if (!customer?.telegram_link_token || hasLinkedBorrower || slowConnection) return undefined;
    const id = setInterval(async () => {
      try {
        const session = await fetchTelegramLinkSession(customer.telegram_link_token);
        if (session) {
          setLinkSession(session);
          if (session.chat_id) clearInterval(id);
        }
      } catch { /* ignore poll errors */ }
    }, 5000);
    return () => clearInterval(id);
  }, [customer?.telegram_link_token, hasLinkedBorrower, slowConnection]);

  useEffect(() => {
    if (!detectedChatId || customer?.telegram_chat_id || autoSavedChatRef.current === detectedChatId) return;

    autoSavedChatRef.current = detectedChatId;
    setSaving(true);
    Promise.resolve(onSave?.({
      telegram_username: detectedUsername || normalizedTelegram || customer?.telegram_username || null,
      telegram_chat_id: detectedChatId,
      telegram_linked_at: linkSession?.linked_at || Date.now(),
      telegram_link_requested_at: linkSession?.requested_at || customer?.telegram_link_requested_at || Date.now(),
      showSavedToast: false,
      closeSheet: false,
    }))
      .then(() => {
        fireToast(lang === 'am' ? 'ቴሌግራም ተገናኝቷል' : 'Telegram connected', 1800);
      })
      .catch(() => {
        autoSavedChatRef.current = null;
        fireToast(lang === 'am' ? 'ቴሌግራም ማስቀመጥ አልተሳካም' : 'Could not save Telegram link', 2200);
      })
      .finally(() => setSaving(false));
  }, [
    customer?.telegram_chat_id,
    customer?.telegram_link_requested_at,
    customer?.telegram_username,
    detectedChatId,
    detectedUsername,
    lang,
    linkSession?.linked_at,
    linkSession?.requested_at,
    normalizedTelegram,
    onSave,
  ]);

  const handleRefresh = async () => {
    if (!customer?.telegram_link_token) return;
    setLoadingSession(true);
    try {
      const session = await fetchTelegramLinkSession(customer.telegram_link_token).catch(() => null);
      if (session) setLinkSession(session);
    } finally {
      setLoadingSession(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      fireToast(lang === 'am' ? 'አገናኝ ተቀዳ' : 'Link copied', 1500);
    } catch {
      fireToast(lang === 'am' ? 'መቅዳት አልተሳካም' : 'Could not copy', 2000);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (!telegramValid) {
        fireToast(t.telegramFormatHint, 2400);
        setSaving(false);
        return;
      }
      if (!telegramServiceAvailable && !slowConnection) {
        fireToast(
          lang === 'am'
            ? 'የቴሌግራም አገልግሎት አሁን አይገኝም። የእጅ ግንኙነት አሁንም ይሰራል።'
            : 'Telegram service is unavailable right now. Manual contact still works.',
          2400
        );
      }
      await onSave?.({
        telegram_username: normalizedTelegram || linkSession?.telegram_username || customer?.telegram_username || null,
        telegram_chat_id: linkSession?.chat_id || customer?.telegram_chat_id || null,
        telegram_linked_at: linkSession?.linked_at || customer?.telegram_linked_at || null,
        telegram_link_requested_at: linkSession?.requested_at || customer?.telegram_link_requested_at || Date.now(),
      });
      onDone?.();
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
    if (!onResendUpdate || resending) return;
    setResending(true);
    try {
      await onResendUpdate();
    } finally {
      setResending(false);
    }
  };

  // Status chip — single compact line summarising the state
  const statusChip = (() => {
    if (hasLinkedBorrower) {
      return {
        bg: '#d1fae5', color: '#065f46', icon: <CheckCircle2 className="w-4 h-4" />,
        text: lang === 'am' ? '✓ ተገናኝቷል' : '✓ Linked',
      };
    }
    if (!linkingAvailable) {
      return {
        bg: '#fef3c7', color: '#92400e', icon: <AlertTriangle className="w-4 h-4" />,
        text: lang === 'am' ? 'አገልግሎት አይገኝም' : 'Service unavailable',
      };
    }
    if (hasPendingLink) {
      return {
        bg: '#dbeafe', color: '#1e3a8a', icon: <MessageCircle className="w-4 h-4" />,
        text: lang === 'am' ? 'የደንበኛ ምላሽ በመጠበቅ ላይ' : 'Waiting for customer',
      };
    }
    return {
      bg: '#dcfce7', color: '#166534', icon: <CheckCircle2 className="w-4 h-4" />,
      text: safeBotStatus.bot_username
        ? `🤖 ${safeBotStatus.bot_username}`
        : (lang === 'am' ? '🤖 ቦት ዝግጁ' : '🤖 Bot ready'),
    };
  })();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto animate-slide-up"
        style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header — tighter padding */}
        <div
          className="sticky top-0 bg-white z-10 px-5 pt-4 pb-3 border-b"
          style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}
        >
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-gray-900 truncate">{t.connectTelegram}</h2>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-muted)' }}>
                {customer?.display_name}
              </p>
            </div>
            <button
              onClick={onDone}
              aria-label={t.close}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center press-scale"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3">

          {/* T2: Compact status chip (replaces the bulky status card) */}
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
            style={{
              background: statusChip.bg,
              color: statusChip.color,
              borderRadius: 999,
              letterSpacing: '0.01em',
            }}
          >
            {statusChip.icon}
            {statusChip.text}
          </div>

          {linkingAvailable && canShowInviteTools && (
            <div
              className="p-3 space-y-2"
              style={{
                background: hasLinkedBorrower ? '#f0fdf4' : '#f8fafc',
                border: `1px solid ${hasLinkedBorrower ? '#bbf7d0' : '#e2e8f0'}`,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <p className="text-sm font-black text-gray-900">
                {hasLinkedBorrower
                  ? (lang === 'am' ? 'ዝግጁ ነው' : 'Ready')
                  : (lang === 'am' ? 'ደንበኛውን በቴሌግራም ያገናኙ' : 'Connect the customer in Telegram')}
              </p>
              <div className="grid gap-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                <p>
                  <strong style={{ color: hasLinkedBorrower ? '#047857' : '#1B4332' }}>
                    {hasLinkedBorrower ? '✓' : '1.'}
                  </strong>{' '}
                  {lang === 'am' ? 'ሊንኩን ይክፈቱ ወይም QR ያሳዩ' : 'Open the link or show the QR'}
                </p>
                <p>
                  <strong style={{ color: hasLinkedBorrower ? '#047857' : '#1B4332' }}>
                    {hasLinkedBorrower ? '✓' : '2.'}
                  </strong>{' '}
                  {lang === 'am' ? 'ደንበኛው በቴሌግራም Start ይጫናል' : 'Customer taps Start in Telegram'}
                </p>
                <p>
                  <strong style={{ color: hasLinkedBorrower ? '#047857' : '#1B4332' }}>
                    {hasLinkedBorrower ? '✓' : '3.'}
                  </strong>{' '}
                  {hasLinkedBorrower
                    ? (lang === 'am' ? 'Gebya በራሱ አስቀምጧል' : 'Gebya saved the link automatically')
                    : (lang === 'am' ? 'Gebya በራሱ ያስቀምጣል' : 'Gebya detects and saves it automatically')}
                </p>
              </div>
            </div>
          )}

          {/* T2: PRIMARY action — opens Telegram with the bot + pre-filled /start */}
          {linkingAvailable && canShowInviteTools && (
            <>
              <a
                href={inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full block p-4 text-center font-black text-base text-white press-scale"
                style={{
                  background: '#1B4332',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  boxShadow: '0 4px 0 #0f2b20, var(--shadow-sm)',
                }}
              >
                <span className="inline-flex items-center gap-2 justify-center">
                  <Send className="w-5 h-5" />
                  {lang === 'am' ? 'ቴሌግራም ይክፈቱ እና ያገናኙ' : 'Open Telegram & link'}
                </span>
              </a>

              {/* Helpful hint below primary action */}
              <p className="text-[11px] text-center" style={{ color: 'var(--color-text-muted)' }}>
                {lang === 'am'
                  ? 'ደንበኛው Start ከጫነ በኋላ Gebya በራሱ ያስቀምጣል'
                  : 'After the customer taps Start, Gebya saves the link automatically'}
              </p>

              {/* T2: QR code collapsed by default for in-person scenarios */}
              <button
                type="button"
                onClick={() => setShowQR(v => !v)}
                className="w-full p-3 text-sm font-bold border-2 press-scale flex items-center justify-center gap-2"
                style={{
                  background: showQR ? 'rgba(196,136,58,0.08)' : '#fff',
                  borderColor: showQR ? '#C4883A' : '#e8e2d8',
                  color: showQR ? '#6b4f1d' : '#374151',
                  borderRadius: 'var(--radius-md)',
                  minHeight: 48,
                }}
              >
                <QrCode className="w-4 h-4" />
                {showQR
                  ? (lang === 'am' ? 'QR ኮድ ደብቅ' : 'Hide QR code')
                  : (lang === 'am' ? '📷 QR ኮድ አሳይ (በአካል ለማጋራት)' : '📷 Show QR code (for in-person)')}
                {showQR ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showQR && (
                <div
                  className="p-4 text-center"
                  style={{
                    background: 'color-mix(in srgb, var(--color-surface) 88%, #f6d79d)',
                    border: '1px solid #f0e1bc',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div
                    className="inline-flex p-3 bg-white"
                    style={{ background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid #f0e1bc' }}
                  >
                    <QRCodeSVG value={inviteLink} size={148} bgColor="#ffffff" fgColor="#1B4332" />
                  </div>
                  <p className="text-xs mt-2.5" style={{ color: 'var(--color-text-muted)' }}>
                    {lang === 'am'
                      ? 'ደንበኛው በቴሌግራም ካሜራ እንዲቃኝ ይጠይቁ'
                      : 'Ask customer to scan with Telegram'}
                  </p>
                  {/* Copy link inside the expanded QR section */}
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="mt-2.5 px-3 py-2 text-xs font-bold border press-scale inline-flex items-center gap-1.5"
                    style={{ background: '#fff', borderColor: '#e8e2d8', borderRadius: 'var(--radius-sm)', color: '#374151' }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {lang === 'am' ? 'አገናኝ ቅዳ' : 'Copy link'}
                  </button>
                </div>
              )}

              {/* T2: Refresh — small secondary action */}
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loadingSession}
                className="w-full p-2.5 text-xs font-bold border press-scale flex items-center justify-center gap-2 disabled:opacity-50"
                style={{
                  background: 'var(--color-surface-muted)',
                  borderColor: 'var(--color-border-light)',
                  color: 'var(--color-text-muted)',
                  borderRadius: 'var(--radius-sm)',
                  minHeight: 40,
                }}
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${loadingSession ? 'animate-spin' : ''}`} />
                {loadingSession
                  ? (lang === 'am' ? 'እየፈተሸ...' : 'Checking...')
                  : (lang === 'am' ? 'አሁን ፈትሽ' : 'Check again')}
              </button>
            </>
          )}

          {/* When service unavailable, show a tight explanation */}
          {!linkingAvailable && (
            <div
              className="p-3"
              style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 'var(--radius-md)' }}
            >
              <p className="text-sm font-bold text-gray-900">
                {telegramServiceAvailable
                  ? (lang === 'am' ? 'ቦቱ ገና አልተዋቀረም።' : 'Telegram bot not configured yet.')
                  : (lang === 'am' ? 'የቴሌግራም አገልግሎት አሁን አይገኝም።' : 'Telegram service is unavailable right now.')}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {lang === 'am'
                  ? 'ከታች የእጅ መንገድ መግባት ይችላሉ።'
                  : 'You can still save a manual Telegram contact below.'}
              </p>
            </div>
          )}

          {/* T2: Manual fallback collapsed unless service is unavailable */}
          <button
            type="button"
            onClick={() => setShowManualFallback(v => !v)}
            className="w-full px-3 py-2 text-xs font-bold border press-scale flex items-center justify-between"
            style={{
              background: !linkingAvailable ? '#fff' : '#fafaf5',
              borderColor: showManualFallback ? '#C4883A' : '#e8e2d8',
              color: showManualFallback ? '#6b4f1d' : '#6b7280',
              borderRadius: 'var(--radius-sm)',
              minHeight: 40,
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              {lang === 'am' ? 'የእጅ አማራጭ' : 'Manual fallback'}
            </span>
            {showManualFallback ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {(showManualFallback || !linkingAvailable) && (
            <div
              className="p-3 space-y-2"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
            >
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {t.manualTelegramFallbackHint}
              </p>
              <input
                type="text"
                value={manualTelegram}
                onChange={(e) => setManualTelegram(e.target.value)}
                placeholder={t.customerTelegramPlaceholder}
                className="w-full p-3 border-2 focus:outline-none text-sm"
                style={{ borderRadius: 'var(--radius-md)', borderColor: telegramValid ? '#e8e2d8' : '#dc2626' }}
              />
              {!telegramValid && (
                <p className="text-[11px]" style={{ color: '#dc2626' }}>
                  {t.telegramFormatHint}
                </p>
              )}
            </div>
          )}

          {/* Resend latest update — only shown if borrower is linked */}
          {hasLinkedBorrower && onResendUpdate && (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="w-full p-2.5 text-xs font-bold border press-scale flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: '#fff',
                borderColor: '#e8e2d8',
                color: '#374151',
                borderRadius: 'var(--radius-sm)',
                minHeight: 40,
              }}
            >
              <Send className="w-3.5 h-3.5" />
              {resending
                ? (lang === 'am' ? 'እየላከ...' : 'Sending...')
                : (lang === 'am' ? 'የመጨረሻ ዝመና እንደገና ላክ' : 'Resend latest update')}
            </button>
          )}
        </div>

        {/* Save button — sticky bottom */}
        <div className="px-5 pb-5 pt-3 sticky bottom-0 bg-white border-t" style={{ borderColor: 'var(--color-border-light)' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !telegramValid}
            className="w-full p-3 font-black text-white text-base flex items-center justify-center gap-2 min-h-[52px] press-scale disabled:opacity-50"
            style={{
              background: '#1B4332',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 3px 0 #0f2b20, var(--shadow-sm)',
            }}
          >
            <CheckCircle2 className="w-5 h-5" />
            {saving
              ? (lang === 'am' ? 'እያስቀመጥኩ...' : 'Saving...')
              : hasLinkedBorrower
                ? (lang === 'am' ? 'ተጠናቋል' : 'Done')
                : (lang === 'am' ? 'አስቀምጥ' : (manualTelegram.trim() ? t.saveFallbackContact : 'Skip for now'))}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CustomerTelegramConnectSheet;

// ReminderSheet.jsx — one-tap dubie reminder modal.
//
// Picks the best channel (Telegram → WhatsApp → SMS → Call), lets the shopkeeper
// pick a tone (Gentle / Firm / Final), preview + edit the message, and send.
//
// On send: opens the channel's deep link (wa.me, sms:, tel:, t.me). For
// Telegram the URL doesn't natively pre-fill, so we copy the message to
// the clipboard before opening so the user can paste in the chat.
//
// Commit C adds Pay-it-now toggle (gradient green band):
// When ON, append a /pay?... URL to the message so the customer can tap once
// and land on a Gebya channel-picker page (telebirr / CBE / Awash) that
// dials the right USSD code. Gebya never touches the money — pure routing.
//
// After send, calls onSent(customerId) so the parent can persist
// `last_reminded_at` on the customer record.

import { useEffect, useMemo, useState } from 'react';
import { X, Send, Copy, CheckCircle2, Bell, Sparkles } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import {
  REMINDER_TEMPLATES,
  CHANNEL_INFO,
  buildReminderMessage,
  getAvailableChannels,
  buildChannelUrl,
  copyMessageToClipboard,
  daysAgoLabel,
} from '../utils/reminders';

// Build the customer-facing Pay-it-now URL.
// All params are URL-encoded; PayPage decodes them and renders the channel
// picker page. Empty/missing values are simply omitted.
//
// Commit C.1: also passes payment-account fields from shopProfile.payments
// so PayPage can show real account numbers (telebirr / CBE / Awash / bank)
// instead of just generic USSD codes.
function buildPayUrl({ shopName, shopPhone, shopTelegram, shopPayments, customer, lang }) {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const balance = Number(customer?.balance || 0);
  const params = new URLSearchParams();

  // Core fields
  if (shopName) params.set('to', shopName);
  if (balance > 0) params.set('amount', String(balance));
  if (customer?.display_name) params.set('from', customer.display_name);
  if (customer?.id) params.set('ref', String(customer.id));
  if (shopPhone) params.set('phone', shopPhone);
  if (shopTelegram) params.set('tg', shopTelegram);
  if (lang) params.set('lang', lang);

  // Payment receiving accounts (Commit C.1). telebirr defaults to shopPhone
  // when its dedicated field is empty — common case for shopkeepers who use
  // the same number for both. Other channels are independent.
  const pmt = shopPayments || {};
  // telebirr: explicit field overrides shop phone; empty string → fall back to phone
  const telebirrPhone = (pmt.telebirr && pmt.telebirr.trim())
    ? (pmt.telebirr.startsWith('+251') ? pmt.telebirr : `+251${pmt.telebirr.replace(/\D/g, '').slice(-9)}`)
    : shopPhone;
  if (telebirrPhone) params.set('tb', telebirrPhone);
  if (pmt.cbe_phone) {
    const cbeFormatted = pmt.cbe_phone.startsWith('+251')
      ? pmt.cbe_phone
      : `+251${pmt.cbe_phone.replace(/\D/g, '').slice(-9)}`;
    params.set('cbe_p', cbeFormatted);
  }
  if (pmt.cbe_account) params.set('cbe_a', pmt.cbe_account);
  if (pmt.awash_phone) {
    const awashFormatted = pmt.awash_phone.startsWith('+251')
      ? pmt.awash_phone
      : `+251${pmt.awash_phone.replace(/\D/g, '').slice(-9)}`;
    params.set('aw_p', awashFormatted);
  }
  if (pmt.bank_name) params.set('bk_n', pmt.bank_name);
  if (pmt.bank_account) params.set('bk_a', pmt.bank_account);

  return `${origin}/pay?${params.toString()}`;
}

function appendPayLink({ baseMessage, payUrl, lang }) {
  if (!payUrl) return baseMessage;
  const trimmed = (baseMessage || '').trimEnd();
  // Avoid double-appending if the URL is already present
  if (trimmed.includes(payUrl)) return trimmed;
  const ctaLabel = lang === 'am'
    ? '👉 በዚህ ይክፈሉ:'
    : '👉 Pay here:';
  // Two newlines so the link reads as a separate block, easy to tap.
  return `${trimmed}\n\n${ctaLabel} ${payUrl}`;
}

function ReminderSheet({ customer, shopName, shopProfile, onClose, onSent }) {
  const { lang, t } = useLang();
  const [template, setTemplate] = useState('gentle');
  const [channel, setChannel] = useState(null);
  const [customMessage, setCustomMessage] = useState(null); // null = use generated text
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  // Commit C.5: Pay-it-now defaults to ON when the shop has at least one
  // configured payment channel (telebirr defaulting to shop phone counts).
  // Reduces friction — most reminders should include the link.
  const initialPayLinkDefault = (() => {
    const pmt = shopProfile?.payments;
    if (!pmt) return false;
    return !!(
      pmt.telebirr || pmt.cbe_phone || pmt.cbe_account ||
      pmt.awash_phone || pmt.bank_account ||
      // Telebirr-from-shop-phone counts as configured even when pmt.telebirr is empty
      shopProfile?.phone
    );
  })();
  const [includePayLink, setIncludePayLink] = useState(initialPayLinkDefault);

  const available = useMemo(() => getAvailableChannels(customer), [customer]);
  const effectiveChannel = channel || available[0] || null;

  const generatedMessage = useMemo(
    () => buildReminderMessage({ template, lang, customer, shopName }),
    [template, lang, customer, shopName]
  );

  // Build the pay link once, memoized on shop/customer changes.
  // Includes payment receiving accounts from shopProfile.payments (Commit C.1).
  const shopPayments = shopProfile?.payments;
  const paymentsKey = shopPayments
    ? `${shopPayments.telebirr || ''}|${shopPayments.cbe_phone || ''}|${shopPayments.cbe_account || ''}|${shopPayments.awash_phone || ''}|${shopPayments.bank_name || ''}|${shopPayments.bank_account || ''}`
    : '';
  const payUrl = useMemo(
    () => buildPayUrl({
      shopName,
      shopPhone: shopProfile?.phone,
      shopTelegram: shopProfile?.telegram,
      shopPayments,
      customer,
      lang,
    }),
    [shopName, shopProfile?.phone, shopProfile?.telegram, paymentsKey, customer?.id, customer?.balance, customer?.display_name, lang]
  );

  // Reset edited message when template OR pay-link toggle changes
  useEffect(() => {
    setCustomMessage(null);
  }, [template, lang, customer?.id, includePayLink]);

  // Final message body = generated + pay link (if toggled), or user-edited verbatim
  const baseMessage = customMessage != null ? customMessage : generatedMessage;
  const message = (customMessage == null && includePayLink)
    ? appendPayLink({ baseMessage, payUrl, lang })
    : baseMessage;

  const hasAnyChannel = available.length > 0;
  const lastReminded = daysAgoLabel(customer?.last_reminded_at, lang);
  const canShowPayToggle = Number(customer?.balance || 0) > 0;

  const handleCopy = async () => {
    const ok = await copyMessageToClipboard(message);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleSend = async () => {
    if (!effectiveChannel || sending) return;
    setSending(true);
    try {
      const url = buildChannelUrl({ channel: effectiveChannel, customer, message });
      if (!url) return;
      // Telegram t.me URLs don't pre-fill text — copy first so the user can paste.
      if (effectiveChannel === 'telegram') {
        await copyMessageToClipboard(message);
      }
      // Open the channel app. Use _blank so mobile browsers route via OS handlers.
      window.open(url, '_blank', 'noopener');
      onSent?.(customer.id);
      onClose?.();
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center"
      style={{ zIndex: 60, background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div
        className="bg-white w-full max-w-md max-h-[92vh] overflow-y-auto"
        style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0' }}
      >
        {/* Sticky header */}
        <div
          className="sticky top-0 bg-white z-10 px-4 py-3 flex items-center justify-between gap-2"
          style={{ borderBottom: '1px solid #e8e2d8' }}
        >
          <div className="min-w-0 flex items-center gap-2">
            <Bell className="w-5 h-5 flex-shrink-0" style={{ color: '#C4883A' }} />
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate" style={{ color: '#1a1a1a' }}>
                {lang === 'am' ? 'ማስታወሻ ላክ' : 'Send reminder'}
              </h2>
              <p className="text-[11px] truncate" style={{ color: '#6b7280' }}>
                {customer?.display_name}
                {lastReminded && <span> · {lang === 'am' ? 'መጨረሻ' : 'last'}: {lastReminded}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={lang === 'am' ? 'ዝጋ' : 'Close'}
            className="press-scale flex items-center justify-center"
            style={{ minWidth: '36px', minHeight: '36px' }}
          >
            <X className="w-5 h-5" style={{ color: '#6b7280' }} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* Balance reminder header */}
          <div
            className="p-3 border flex items-center justify-between gap-2"
            style={{
              background: '#fffbeb',
              borderColor: '#fde68a',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#92400e' }}>
              {lang === 'am' ? 'ቀሪ ዱቤ' : 'Outstanding'}
            </p>
            <p className="text-lg font-bold" style={{ color: '#92400e' }}>
              {fmt(Number(customer?.balance || 0))} {t.birr || 'birr'}
            </p>
          </div>

          {/* Template tone picker */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'አንደ ምን ያስታውሱ' : 'Tone'}
            </label>
            <div className="flex gap-1.5">
              {Object.entries(REMINDER_TEMPLATES).map(([key, tpl]) => {
                const active = template === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTemplate(key)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 border-2 text-xs font-bold transition-all min-h-[48px] press-scale"
                    style={{
                      borderRadius: 'var(--radius-sm)',
                      borderColor: active ? '#C4883A' : '#e8e2d8',
                      background: active ? 'rgba(196,136,58,0.08)' : '#fff',
                      color: active ? '#6b4f1d' : '#6b7280',
                    }}
                  >
                    <span className="text-base leading-none">{tpl.emoji}</span>
                    <span className="text-[11px]">{tpl.label[lang] || tpl.label.en}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pay-it-now toggle — gradient green band.
              Hidden when balance is 0 (nothing to collect). */}
          {canShowPayToggle && (
            <button
              type="button"
              onClick={() => setIncludePayLink((v) => !v)}
              className="w-full press-scale text-left"
              style={{
                background: includePayLink
                  ? 'linear-gradient(135deg, #16a34a 0%, #1B4332 100%)'
                  : 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                border: `2px solid ${includePayLink ? '#15803d' : '#86efac'}`,
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                color: includePayLink ? '#fff' : '#065f46',
                transition: 'all 0.15s ease',
              }}
              aria-pressed={includePayLink}
            >
              <div className="flex items-center gap-3">
                {/* Toggle visual */}
                <div
                  style={{
                    width: '44px',
                    height: '26px',
                    borderRadius: '999px',
                    background: includePayLink ? 'rgba(255,255,255,0.35)' : '#fff',
                    border: `1.5px solid ${includePayLink ? 'rgba(255,255,255,0.6)' : '#86efac'}`,
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: includePayLink ? '20px' : '2px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: includePayLink ? '#fff' : '#16a34a',
                      transition: 'left 0.18s ease',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                    <p className="text-sm font-bold leading-tight">
                      {lang === 'am' ? 'የመክፈያ አገናኝ ጨምር' : 'Add Pay-it-now link'}
                    </p>
                  </div>
                  <p
                    className="text-[11px] mt-0.5 leading-tight"
                    style={{ color: includePayLink ? 'rgba(255,255,255,0.85)' : '#047857' }}
                  >
                    {includePayLink
                      ? (lang === 'am'
                          ? 'ደንበኛው ይነካዋል → telebirr / CBE / Awash ይመርጣል → በቀጥታ ይከፍላል።'
                          : 'Customer taps → picks telebirr / CBE / Awash → pays you direct.')
                      : (lang === 'am'
                          ? 'በመልዕክቱ ላይ የ /pay አገናኝ ይጨምሩ።'
                          : 'Append a /pay link to the message.')}
                  </p>
                </div>
              </div>
              {includePayLink && (
                <div
                  className="mt-2 pt-2"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.25)' }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {lang === 'am' ? 'ደንበኛው የሚያየው' : 'Customer sees'}
                  </p>
                  {/* Show configured channels with checkmarks so the shopkeeper
                      knows which payment options will appear on the customer-
                      facing page. Unconfigured channels show in faded text. */}
                  <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,0.95)' }}>
                    {(() => {
                      const tbOk = !!(shopPayments?.telebirr || shopProfile?.phone);
                      const cbeOk = !!(shopPayments?.cbe_phone || shopPayments?.cbe_account);
                      const awOk = !!(shopPayments?.awash_phone);
                      const bkOk = !!(shopPayments?.bank_name && shopPayments?.bank_account);
                      const tag = (label, ok) => (
                        <span style={{ opacity: ok ? 1 : 0.45 }}>
                          {ok ? '✓' : '○'} {label}
                        </span>
                      );
                      return (
                        <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px 10px' }}>
                          {tag('💛 telebirr', tbOk)}
                          {tag('💜 CBE', cbeOk)}
                          {tag('🟡 Awash', awOk)}
                          {tag(`🏦 ${lang === 'am' ? 'ባንክ' : 'Bank'}`, bkOk)}
                        </span>
                      );
                    })()}
                  </p>
                  {/* Hint when no channels beyond telebirr are configured */}
                  {!shopPayments?.cbe_phone && !shopPayments?.cbe_account
                    && !shopPayments?.awash_phone
                    && !(shopPayments?.bank_name && shopPayments?.bank_account) && (
                    <p
                      className="text-[10px] mt-1.5"
                      style={{ color: 'rgba(255,255,255,0.85)', fontStyle: 'italic' }}
                    >
                      💡 {lang === 'am'
                        ? 'ብዙ አማራጭ ለመስጠት Settings → ክፍያ መለያዎች ላይ ይጨምሩ።'
                        : 'Add more options in Settings → Payment accounts.'}
                    </p>
                  )}
                  <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    🔒 {lang === 'am' ? 'Gebya ገንዘቡን አያይም።' : "Gebya doesn't see the money."}
                  </p>
                  {/* Commit C.3: SMS size hint. Amharic SMS is 70 chars/segment
                      so cramming all account numbers into the message body
                      would multiply cost. The /pay link carries the data. */}
                  <p
                    className="text-[10px] mt-1.5"
                    style={{ color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}
                  >
                    💡 {lang === 'am'
                      ? 'መልዕክት አጭር ይቆያል — አገናኙ ሁሉንም መለያዎች ይይዛል።'
                      : 'Message stays short — the link carries all your account numbers.'}
                  </p>
                </div>
              )}
            </button>
          )}

          {/* Message preview + edit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#6b7280' }}>
                {lang === 'am' ? 'መልዕክት' : 'Message'}
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="press-scale flex items-center gap-1 text-[11px] font-bold"
                style={{ color: copied ? '#16a34a' : '#6b7280', minHeight: '28px', padding: '0 4px' }}
              >
                {copied
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> {lang === 'am' ? 'ተቀዳ' : 'Copied'}</>
                  : <><Copy className="w-3.5 h-3.5" /> {lang === 'am' ? 'ቅዳ' : 'Copy'}</>
                }
              </button>
            </div>
            <textarea
              value={message}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={includePayLink ? 6 : 4}
              className="w-full p-3 border-2 focus:outline-none text-sm resize-none"
              style={{
                borderRadius: 'var(--radius-md)',
                borderColor: '#e8e2d8',
                lineHeight: '1.5',
              }}
            />
            <p className="text-[10px] mt-1" style={{ color: '#9ca3af' }}>
              {lang === 'am'
                ? 'መልዕክቱን ማርትዕ ይችላሉ።'
                : 'You can edit the message before sending.'}
            </p>
          </div>

          {/* Channel picker */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'am' ? 'በምን ይላኩ' : 'Send via'}
            </label>
            {hasAnyChannel ? (
              <div className="flex gap-1.5 flex-wrap">
                {available.map((ch) => {
                  const info = CHANNEL_INFO[ch];
                  const active = effectiveChannel === ch;
                  const isTelegram = ch === 'telegram';
                  // Telegram-first: highlight Telegram with a gold border + "★" badge
                  // (Most Ethiopian shopkeepers reach customers via Telegram more than WhatsApp.)
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className="flex items-center gap-1.5 py-2.5 px-3 border-2 text-sm font-bold transition-all min-h-[44px] press-scale relative"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        borderColor: active
                          ? '#1B4332'
                          : isTelegram
                            ? '#C4883A'
                            : '#e8e2d8',
                        background: active
                          ? 'rgba(27,67,50,0.1)'
                          : isTelegram
                            ? 'rgba(196,136,58,0.08)'
                            : '#fff',
                        color: active
                          ? '#1B4332'
                          : isTelegram
                            ? '#6b4f1d'
                            : '#6b7280',
                      }}
                    >
                      <span className="text-base">{info.emoji}</span>
                      <span>{info.label[lang] || info.label.en}</span>
                      {isTelegram && !active && (
                        <span
                          className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-0.5 leading-none"
                          style={{
                            background: '#C4883A',
                            color: '#fff',
                            borderRadius: '999px',
                          }}
                        >
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 text-xs" style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 'var(--radius-sm)',
                color: '#92400e',
              }}>
                {lang === 'am'
                  ? 'ስልክ ወይም ቴሌግራም አልተመዘገበም። የደንበኛውን ገጽ ላይ መረጃ ይጨምሩ።'
                  : 'No phone or Telegram on file. Add contact info on the customer page.'}
              </div>
            )}
            {effectiveChannel === 'telegram' && (
              <p className="text-[10px] mt-1.5" style={{ color: '#9ca3af' }}>
                {lang === 'am'
                  ? 'ቴሌግራም መልዕክት አስቀድሞ አይሞላም — መልዕክቱ በ Clipboard ይቀመጣል፣ ለጥፍ ።'
                  : 'Telegram won\'t pre-fill — the message will be copied to clipboard, paste it.'}
              </p>
            )}
          </div>
        </div>

        {/* Sticky send button */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid #e8e2d8' }}>
          <button
            onClick={handleSend}
            disabled={!effectiveChannel || sending || !message.trim()}
            className="w-full p-3 font-bold text-white text-base flex items-center justify-center gap-2 press-scale transition-all"
            style={{
              background: (effectiveChannel && !sending && message.trim()) ? '#C4883A' : '#e5e7eb',
              color: (effectiveChannel && !sending && message.trim()) ? '#fff' : '#9ca3af',
              cursor: (effectiveChannel && !sending && message.trim()) ? 'pointer' : 'not-allowed',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Send className="w-5 h-5" />
            {sending
              ? (lang === 'am' ? 'እየተላከ…' : 'Sending…')
              : (lang === 'am' ? 'ላክ' : 'Send reminder')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReminderSheet;

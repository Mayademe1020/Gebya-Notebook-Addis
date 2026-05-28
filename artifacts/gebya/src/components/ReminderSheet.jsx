// ReminderSheet.jsx — one-tap dubie reminder modal.
//
// Picks the best channel (Telegram → WhatsApp → SMS → Call), lets the shopkeeper
// pick a tone (Gentle / Firm / Final), preview + edit the message, and send.
//
// On send: opens the channel's deep link (wa.me, sms:, tel:, t.me). For
// Telegram the URL doesn't natively pre-fill, so we copy the message to
// the clipboard before opening so the user can paste in the chat.
//
// After send, calls onSent(customerId) so the parent can persist
// `last_reminded_at` on the customer record.

import { useEffect, useMemo, useState } from 'react';
import { X, Send, Copy, CheckCircle2, Bell } from 'lucide-react';
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

function ReminderSheet({ customer, shopName, onClose, onSent }) {
  const { lang, t } = useLang();
  const [template, setTemplate] = useState('gentle');
  const [channel, setChannel] = useState(null);
  const [customMessage, setCustomMessage] = useState(null); // null = use generated text
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const available = useMemo(() => getAvailableChannels(customer), [customer]);
  const effectiveChannel = channel || available[0] || null;

  const generatedMessage = useMemo(
    () => buildReminderMessage({ template, lang, customer, shopName }),
    [template, lang, customer, shopName]
  );

  // Reset edited message when template changes
  useEffect(() => {
    setCustomMessage(null);
  }, [template, lang, customer?.id]);

  const message = customMessage != null ? customMessage : generatedMessage;
  const hasAnyChannel = available.length > 0;
  const lastReminded = daysAgoLabel(customer?.last_reminded_at, lang);

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
              rows={4}
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
                  return (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className="flex items-center gap-1.5 py-2 px-3 border-2 text-xs font-bold transition-all min-h-[40px] press-scale"
                      style={{
                        borderRadius: 'var(--radius-sm)',
                        borderColor: active ? '#1B4332' : '#e8e2d8',
                        background: active ? 'rgba(27,67,50,0.08)' : '#fff',
                        color: active ? '#1B4332' : '#6b7280',
                      }}
                    >
                      <span>{info.emoji}</span>
                      <span>{info.label[lang] || info.label.en}</span>
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

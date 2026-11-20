// ReminderSheet.jsx — one-tap dubie reminder modal.
//
// Picks the best channel (Telegram → WhatsApp → SMS → Call), lets the shopkeeper
// pick a tone (Gentle / Firm / Final), preview + edit the message, and send.
//
// On send:
//   - Telegram: calls the backend API (remindersApi.sendManualReminder) to push
//     the message via the shop's Telegram bot directly to the customer.
//   - WhatsApp: opens wa.me with pre-filled text (native deep link).
//   - SMS: opens sms: URL with pre-filled body (native deep link).
//   - Call: opens tel: URL.
//
// For Telegram the message is sent server-side, so no clipboard copy needed.
// After send, calls onSent(customerId) so the parent can persist
// `last_reminded_at` on the customer record.

import { useEffect, useMemo, useState } from 'react';
import { X, Send, Copy, CheckCircle2, Bell } from 'lucide-react';
import { fmt } from '../utils/numformat';
import { useLang } from '../context/LangContext';
import { remindersApi } from '../api/reminders';
import {
  REMINDER_TEMPLATES,
  CHANNEL_INFO,
  buildReminderMessage,
  getAvailableChannels,
  buildChannelUrl,
  copyMessageToClipboard,
  daysAgoLabel,
} from '../utils/reminders';
import { label } from '../labels/index.js';

function ReminderSheet({ customer, shopName, shopProfile, onClose, onSent, defaultChannel }) {
  const { lang, t } = useLang();
  const [template, setTemplate] = useState('gentle');
  const [channel, setChannel] = useState(defaultChannel || null);
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

  // Final message body = generated text or user-edited verbatim
  const baseMessage = customMessage != null ? customMessage : generatedMessage;
  const message = baseMessage;

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
      if (effectiveChannel === 'telegram' && customer?.telegram_chat_id) {
        // Send via backend API — the bot delivers the message directly through Telegram
        await remindersApi.sendManualReminder(
          shopProfile?.shop_id || shopProfile?.id,
          customer.id,
          {
            balance: Number(customer?.balance || 0),
            dueDate: customer?.due_date ? Number(customer.due_date) : undefined,
            language: label('credit.en', lang),
            chatId: customer?.telegram_chat_id || undefined,
            customerName: customer?.display_name || undefined,
            phoneNumber: customer?.phone || undefined,
          }
        );
      } else {
        // For WhatsApp/SMS/Call: open the native deep link
        const url = buildChannelUrl({ channel: effectiveChannel, customer, message });
        if (!url) return;
        // Telegram t.me URLs don't pre-fill text — copy first so the user can paste.
        if (effectiveChannel === 'telegram') {
          await copyMessageToClipboard(message);
        }
        window.open(url, '_blank', 'noopener');
      }
      onSent?.(customer.id);
      onClose?.();
    } catch (err) {
      console.error('Reminder send failed:', err);
      // Fall back to opening the channel URL if the API call fails
      if (effectiveChannel === 'telegram' && customer?.telegram_username) {
        const url = `https://t.me/${String(customer.telegram_username).replace(/^@/, '')}`;
        await copyMessageToClipboard(message);
        window.open(url, '_blank', 'noopener');
      }
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
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="min-w-0 flex items-center gap-2">
            <Bell className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--color-accent-amber)' }} />
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate" style={{ color: 'var(--color-text)' }}>
                {label('credit.send-reminder', lang)}
              </h2>
              <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>
                {customer?.display_name}
                {lastReminded && <span> · {label('credit.last', lang)}: {lastReminded}</span>}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={label('credit.close', lang)}
            className="press-scale flex items-center justify-center"
            style={{ minWidth: '36px', minHeight: '36px' }}
          >
            <X className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">

          {/* Balance reminder header */}
          <div
            className="p-3 border flex items-center justify-between gap-2"
            style={{
              background: 'var(--color-warning-bg)',
              borderColor: 'var(--color-warning-border)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-warning)' }}>
              {label('credit.outstanding', lang)}
            </p>
            <p className="text-lg font-bold" style={{ color: 'var(--color-warning)' }}>
              {fmt(Number(customer?.balance || 0))} {t.birr || 'birr'}
            </p>
          </div>

          {/* Template tone picker */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('credit.tone', lang)}
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
                      borderColor: active ? 'var(--color-accent-amber)' : 'var(--color-border)',
                      background: active ? 'rgba(196,136,58,0.08)' : 'var(--color-bg-white)',
                      color: active ? 'var(--color-warning)' : 'var(--color-text-muted)',
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
              <label className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                {label('credit.message', lang)}
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="press-scale flex items-center gap-1 text-[11px] font-bold"
                style={{ color: copied ? 'var(--color-success)' : 'var(--color-text-muted)', minHeight: '28px', padding: '0 4px' }}
              >
                {copied
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> {label('credit.copied-2', lang)}</>
                  : <><Copy className="w-3.5 h-3.5" /> {label('credit.copy', lang)}</>
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
                borderColor: 'var(--color-border)',
                lineHeight: '1.5',
              }}
            />
            <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-soft)' }}>
              {label('credit.you-can-edit-the-message-before-sending', lang)}
            </p>
          </div>

          {/* Channel picker */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
              {label('credit.send-via', lang)}
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
                          ? 'var(--color-primary)'
                          : isTelegram
                            ? 'var(--color-accent-amber)'
                            : 'var(--color-border)',
                        background: active
                          ? 'rgba(27,67,50,0.1)'
                          : isTelegram
                            ? 'rgba(196,136,58,0.08)'
                            : 'var(--color-bg-white)',
                        color: active
                          ? 'var(--color-primary)'
                          : isTelegram
                            ? 'var(--color-warning)'
                            : 'var(--color-text-muted)',
                      }}
                    >
                      <span className="text-base">{info.emoji}</span>
                      <span>{info.label[lang] || info.label.en}</span>
                      {isTelegram && !active && (
                        <span
                          className="absolute -top-1.5 -right-1.5 text-[9px] font-bold px-1 py-0.5 leading-none"
                          style={{
                            background: 'var(--color-accent-amber)',
                            color: 'var(--color-bg-white)',
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
                background: 'var(--color-warning-bg)',
                border: '1px solid var(--color-warning-border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-warning)',
              }}>
                {label('credit.no-phone-or-telegram-on-file-add-contact', lang)}
              </div>
            )}
            {effectiveChannel === 'telegram' && customer?.telegram_chat_id && (
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-soft)' }}>
                {label('credit.message-is-sent-via-your-telegram-bot', lang)}
              </p>
            )}
          </div>
        </div>

        {/* Sticky send button */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button
            onClick={handleSend}
            disabled={!effectiveChannel || sending || !message.trim()}
            className="w-full p-3 font-bold text-white text-base flex items-center justify-center gap-2 press-scale transition-all"
            style={{
              background: (effectiveChannel && !sending && message.trim()) ? 'var(--color-accent-amber)' : 'var(--color-bg-disabled)',
              color: (effectiveChannel && !sending && message.trim()) ? 'var(--color-bg-white)' : 'var(--color-text-soft)',
              cursor: (effectiveChannel && !sending && message.trim()) ? 'pointer' : 'not-allowed',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <Send className="w-5 h-5" />
            {sending
              ? (label('credit.sending', lang))
              : (label('credit.send-reminder-2', lang))}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReminderSheet;

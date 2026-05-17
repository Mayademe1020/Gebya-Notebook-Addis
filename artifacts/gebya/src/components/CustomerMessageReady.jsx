import { useState } from 'react';
import { Copy, MessageCircle, Phone, X } from 'lucide-react';
import { buildCreditAddedMessage, buildPaymentReceiptMessage } from '../utils/customerReminder';

function CustomerMessageReady({ customer, shopName, type, amount, itemNote, dueDate, balance, onDone }) {
  const [copied, setCopied] = useState(false);

  const isCredit = type === 'credit';
  const message = isCredit
    ? buildCreditAddedMessage({ customer, shopName, amount, itemNote, dueDate, balance })
    : buildPaymentReceiptMessage({ customer, shopName, amount, balance });

  const hasPhone = Boolean(customer?.phone_number || customer?.phoneNumber);
  const hasTelegram = Boolean(customer?.telegram_username || customer?.telegramUsername || customer?.telegram_username);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing, user can still see the message
    }
  };

  const handleSMS = () => {
    if (!hasPhone) return;
    const encodedBody = encodeURIComponent(message);
    window.open(`sms:?body=${encodedBody}`, '_blank', 'noopener,noreferrer');
  };

  const handleTelegram = () => {
    const telegram = customer?.telegram_username || customer?.telegramUsername;
    if (!telegram) return;
    const normalized = telegram.startsWith('@') ? telegram.slice(1) : telegram;
    const encoded = encodeURIComponent(message);
    window.open(`https://t.me/${normalized}?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 animate-fade">
      <div
        className="bg-white w-full max-w-md max-h-[85vh] overflow-y-auto animate-slide-up"
        style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="sticky top-0 bg-white z-10 px-4 py-3 border-b" style={{ borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', borderColor: 'var(--color-border-light)' }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-black" style={{ color: isCredit ? '#92400e' : '#166534' }}>
              {isCredit ? '✓ Credit saved' : '✓ Payment saved'}
            </p>
            <button
              type="button"
              onClick={onDone}
              aria-label="Done"
              className="p-1.5 rounded-full hover:bg-gray-100 transition-colors min-w-[36px] min-h-[36px] flex items-center justify-center press-scale"
            >
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div
            className="p-3 border"
            style={{
              background: isCredit ? '#fffbeb' : '#f0fdf4',
              borderColor: isCredit ? '#fde68a' : '#bbf7d0',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <pre className="text-xs whitespace-pre-wrap font-mono leading-snug" style={{ color: '#374151', maxHeight: '100px', overflowY: 'auto' }}>
              {message.slice(0, 200)}{message.length > 200 ? '...' : ''}
            </pre>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {hasPhone && (
              <button
                type="button"
                onClick={handleSMS}
                className="w-full p-2.5 font-bold text-white text-sm min-h-[44px] flex items-center justify-center gap-2 press-scale"
                style={{ background: '#166534', borderRadius: 'var(--radius-md)', boxShadow: '0 3px 0 #14532d' }}
              >
                <Phone className="w-4 h-4" />
                Send SMS
              </button>
            )}

            {!hasPhone && (
              <div
                className="w-full p-2.5 min-h-[44px] flex items-center justify-center gap-2 text-xs"
                style={{ background: '#f3f4f6', borderRadius: 'var(--radius-md)', color: '#9ca3af' }}
              >
                Add mobile number to send SMS
              </div>
            )}

            {hasTelegram && (
              <button
                type="button"
                onClick={handleTelegram}
                className="w-full p-2.5 font-bold text-white text-sm min-h-[44px] flex items-center justify-center gap-2 press-scale"
                style={{ background: '#2481cc', borderRadius: 'var(--radius-md)', boxShadow: '0 3px 0 #1a5f94' }}
              >
                <MessageCircle className="w-4 h-4" />
                Send via Telegram
              </button>
            )}

            <button
              type="button"
              onClick={handleCopy}
              className="w-full p-2.5 font-bold text-white text-sm min-h-[44px] flex items-center justify-center gap-2 press-scale"
              style={{ background: copied ? '#059669' : '#374151', borderRadius: 'var(--radius-md)', boxShadow: copied ? 'none' : '0 3px 0 #1f2937' }}
            >
              <Copy className="w-4 h-4" />
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>

            <button
              type="button"
              onClick={onDone}
              className="w-full p-2 font-semibold text-xs min-h-[36px] flex items-center justify-center press-scale"
              style={{ color: '#6b7280' }}
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CustomerMessageReady;
// CustomerTelegramConnectSheet.jsx — Minimal 1-tap Telegram linking.
//
// The shop owner shows this to the customer to connect them on Telegram.
// The system generates a deep link + QR code automatically. When the
// customer taps "Start" in the bot, the sheet auto-saves the chat_id.
//
// That's it. No instructions, no status chips, no refresh buttons.

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Copy, Send } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fireToast } from './Toast';
import { useLang } from '../context/LangContext';
import { buildCustomerConnectLink, createCustomerTelegramLinkToken } from '../utils/customerTelegram';
import {
  fetchTelegramBotStatus,
  fetchTelegramLinkSession,
  createTelegramLinkSession,
  createOneTimeCode,
} from '../utils/telegramBotClient';
import { isValidTelegramCode } from '../utils/telegramCode';
import { label } from '../labels/index';

const POLL_INTERVAL_MS = 4000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

const FRONTEND_BOT_USERNAME = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim();

function CustomerTelegramConnectSheet({ customer, shopProfile, onSave, onDone, onResendUpdate }) {
  const { lang } = useLang();
  const [botUsername, setBotUsername] = useState(FRONTEND_BOT_USERNAME);
  const [linkSession, setLinkSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [autoLinking, setAutoLinking] = useState(false);
  const [mode, setMode] = useState('qr'); // 'qr' | 'code'
  const [otc, setOtc] = useState(null); // { code, token, expires_at }
  const pollStartedRef = useRef(false);
  const autoSavedRef = useRef(false);
  const sessionCreatedRef = useRef(false);

  const hasLinkedBorrower = Boolean(customer?.telegram_chat_id || linkSession?.chat_id);
  // Auto-generate a token if the customer record doesn't have one yet (legacy/synced customers)
  const token = customer?.telegram_link_token || createCustomerTelegramLinkToken(customer?.id);

  // ─── Get bot username + create session + poll for completion ──────────
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let active = true;
    const shopId = shopProfile?.shop_id || shopProfile?.id;

    fetchTelegramBotStatus().then(status => {
      if (!active) return;
      setBotUsername(status?.bot_username || status?.bot_username || FRONTEND_BOT_USERNAME);
    }).catch(() => {});

    // Create the backend link session so the customer's /start can be resolved.
    // The webhook's linkTelegramChatToSession requires an existing session for the token.
    if (!sessionCreatedRef.current) {
      sessionCreatedRef.current = true;
      createTelegramLinkSession({
        shopId,
        token,
        customerId: customer?.id,
        customerName: customer?.display_name || "Customer",
        shopName: shopProfile?.name || "Gebya",
        currentBalance: Number(customer?.balance || 0),
        updatesEnabled: Boolean(customer?.telegram_notify_enabled),
      }).catch(err => {
        console.error('Failed to create Telegram link session:', err);
      });
    }

    // Poll for session completion (customer tapped "Start" or sent a code)
    if (!hasLinkedBorrower && !pollStartedRef.current && token) {
      pollStartedRef.current = true;
      const startTime = Date.now();
      // The token used for polling depends on the mode:
      //  - QR/deep-link mode → the customer token (t.me/...?start=<token>)
      //  - Code mode → the one-time-code token (code-<CODE>)
      const pollToken = mode === 'code' ? (otc?.token || token) : token;

      const poll = async () => {
        if (Date.now() - startTime > POLL_TIMEOUT_MS) {
          pollStartedRef.current = false;
          return;
        }

        try {
          const session = await fetchTelegramLinkSession(pollToken);
          if (session) {
            setLinkSession(session);
            if (session.chat_id && !autoSavedRef.current) {
              autoSavedRef.current = true;
              pollStartedRef.current = false;

              setAutoLinking(true);
              onSave?.({
                telegram_username: session.telegram_username,
                telegram_chat_id: session.chat_id,
                telegram_linked_at: session.linked_at,
                telegram_link_requested_at: session.requested_at || customer?.telegram_link_requested_at,
                telegram_link_token: token,
              }).then(() => {
                fireToast(label('credit.telegram-connected', lang), 1800);
                onResendUpdate?.();
              }).catch(err => {
                console.error('Auto-link save failed:', err);
                autoSavedRef.current = false;
              }).finally(() => setAutoLinking(false));
            }
          }
        } catch { /* ignore */ }

      };

      const id = setInterval(poll, POLL_INTERVAL_MS);
      poll(); // initial check

      return () => { clearInterval(id); pollStartedRef.current = false; };
    }
  }, [token, hasLinkedBorrower, customer?.telegram_link_requested_at, lang, onSave, onResendUpdate, shopProfile, mode, otc?.token]);

  const deepLink = useMemo(
    () => token && botUsername
      ? buildCustomerConnectLink({
          botUsername,
          token,
          customerName: customer?.display_name,
          shopName: shopProfile?.name,
          shopTelegram: shopProfile?.telegram,
        })
      : '',
    [botUsername, token, customer?.display_name, shopProfile?.name, shopProfile?.telegram]
  );

  const handleCopy = async () => {
    if (!deepLink) return;
    try {
      await navigator.clipboard.writeText(deepLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      fireToast(label('credit.could-not-copy', lang), 2000);
    }
  };

  // ─── Code mode: generate a fresh one-time code ──────────────────────
  const handleGenerateCode = async () => {
    const shopId = shopProfile?.shop_id || shopProfile?.id;
    try {
      const res = await createOneTimeCode({
        customerId: customer?.id,
        customerName: customer?.display_name || 'Customer',
        shopId,
        shopName: shopProfile?.name || 'Gebya',
      });
      setOtc(res);
      setMode('code');
      // Reset polling so it picks up the new code token
      pollStartedRef.current = false;
    } catch {
      fireToast(label('credit.could-not-generate-code', lang), 2500);
    }
  };

  const handleUseQr = () => {
    setMode('qr');
    pollStartedRef.current = false;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div
        className="bg-white w-full max-w-xs mx-4 text-center"
        style={{
          borderRadius: 24,
          padding: 28,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)',
        }}
      >
        {/* Close */}
        <button
          onClick={onDone}
          aria-label={label('credit.close', lang)}
          className="absolute top-3 right-3 w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* Customer name */}
        <h2 className="text-lg font-bold text-gray-900 mb-1 truncate">
          {customer?.display_name || (label('credit.customer', lang))}
        </h2>
        <p className="text-xs text-gray-500 mb-5 truncate">
          {shopProfile?.name || 'Gebya'}
        </p>

        {!deepLink && !loading && (
          <p className="text-sm text-gray-500 py-8">
            {label('credit.no-link-token-for-this-customer', lang)}
          </p>
        )}

        {mode === 'code' && otc && (
          <>
            <p className="text-xs font-bold text-gray-600 mt-2 text-center">
              {lang === 'am'
                ? ('ኮዱን ለ @' + (botUsername || 'bot') + ' ይላኩ')
                : ('Tell the customer to send this code to @' + (botUsername || 'bot'))}
            </p>
            <div className="mx-auto my-2 w-52 h-16 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-dashed border-green-600">
              <span className="text-4xl font-black text-green-800" style={{ letterSpacing: '0.25em' }}>
                {otc.code}
              </span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-center">
              {label('credit.code-expires-in-15-minutes', lang)}
            </p>
            <button
              type="button"
              onClick={handleGenerateCode}
              className="w-full py-2 rounded-lg text-xs font-bold text-white press-scale mt-2"
              style={{ background: 'var(--color-primary)' }}
            >
              {label('credit.generate-new-code', lang)}
            </button>
          </>
        )}

        {mode === 'code' && (
          <button type="button" onClick={handleUseQr}
            className="w-full py-2 rounded-lg text-xs font-bold mt-2 press-scale"
            style={{ color: 'var(--color-primary)', background: 'transparent', border: '1px solid var(--color-border)' }}
          >
            {label('credit.use-qr-instead', lang)}
          </button>
        )}

        {mode === 'qr' && deepLink && (
          <>
            <div className="flex justify-center mb-4 p-2 bg-white border-2 border-gray-100 rounded-2xl">
              <QRCodeSVG value={deepLink} size={168} fgColor="#16425b" />
            </div>

            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full p-3 mb-3 text-center font-bold text-white text-sm rounded-xl press-scale"
              style={{
                background: hasLinkedBorrower ? '#15803d' : '#1e3a8a',
                boxShadow: '0 3px 0 #0f2b2030',
              }}
            >
              {hasLinkedBorrower && autoLinking
                ? (label('credit.linking', lang))
                : hasLinkedBorrower
                  ? (label('credit.linked', lang))
                  : (label('credit.open-in-telegram', lang))}
            </a>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 w-full p-2 text-xs text-gray-600 hover:bg-gray-50 rounded-lg press-scale"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied
                ? (label('credit.copied', lang))
                : (label('credit.copy-link', lang))}
            </button>

            <button
              type="button"
              onClick={handleGenerateCode}
              className="w-full py-2 rounded-lg text-xs font-bold mt-2 press-scale"
              style={{ color: 'var(--color-primary)', background: 'transparent', border: '1.5px dashed var(--color-accent-amber)' }}
            >
              {label('credit.use-a-code-instead', lang)}
            </button>
          </>
        )}

        {/* Auto-linking hint */}
        {deepLink && !hasLinkedBorrower && (
          <p className="text-[10px] text-gray-400 mt-3">
            {label('credit.customer-taps-start-linked-automatically', lang)}
          </p>
        )}
      </div>
    </div>
  );
}

export default CustomerTelegramConnectSheet;

// PayPage.jsx — Customer-facing payment channel picker.
//
// Reached via URL: /pay?to={shop}&amount={n}&from={customer}&ref={id}&phone={shop_phone}&tg={shop_telegram}
//
// Pure client-side. Reads URL params. Renders a static page that lists the
// most common Ethiopian payment channels:
//   - telebirr (USSD *127# or open app)
//   - CBE Birr (USSD *847#)
//   - Awash Mobile (USSD *901#)
//   - Bank transfer · shows shop contact info with copy button
//
// We DO NOT process money. We route. The customer pays direct to the shop's
// account; the shop confirms manually in Gebya when the money arrives.
//
// Privacy promise · visible at the bottom · no data leaves their phone.

import { useEffect, useMemo, useState } from 'react';

function decodeParam(value) {
  if (!value) return '';
  try { return decodeURIComponent(value); } catch { return value; }
}

function readUrlParams() {
  if (typeof window === 'undefined') return {};
  const u = new URLSearchParams(window.location.search);
  return {
    to: decodeParam(u.get('to')),
    amount: decodeParam(u.get('amount')),
    from: decodeParam(u.get('from')),
    ref: decodeParam(u.get('ref')),
    phone: decodeParam(u.get('phone')),
    tg: decodeParam(u.get('tg')),
    // Commit C.1: explicit payment account fields. When set, channel cards
    // show the real account number with a copy button. When unset, cards
    // still render but only with the generic USSD code as a fallback.
    tb: decodeParam(u.get('tb')),        // telebirr phone (defaults to `phone`)
    cbe_p: decodeParam(u.get('cbe_p')),  // CBE Birr phone (for *847#)
    cbe_a: decodeParam(u.get('cbe_a')),  // CBE bank account number
    aw_p: decodeParam(u.get('aw_p')),    // Awash Mobile phone (for *901#)
    bk_n: decodeParam(u.get('bk_n')),    // Bank name (e.g. "Dashen")
    bk_a: decodeParam(u.get('bk_a')),    // Bank account number
    // Legacy single-CBE param — keep reading it for backwards compat with old links
    cbe: decodeParam(u.get('cbe')),
    awash: decodeParam(u.get('awash')),
    lang: (u.get('lang') === 'am') ? 'am' : 'en',
  };
}

function formatAmount(s) {
  if (!s) return '';
  const n = Number(String(s).replace(/[^\d.]/g, ''));
  if (Number.isNaN(n)) return s;
  return n.toLocaleString('en-US');
}

const TEXT = {
  en: {
    title: 'Pay to',
    youOwe: 'You owe',
    birr: 'birr',
    from: 'from',
    forCredit: 'for credit',
    popular: 'Most popular in Ethiopia',
    bankTransfer: 'Bank transfer',
    telebirrName: 'telebirr',
    telebirrSubGeneric: 'Open telebirr app · or USSD *127#',
    telebirrSubWithPhone: 'Send to this phone via telebirr · or USSD *127#',
    telebirrTag: '⭐ MOST USED',
    cbeName: 'CBE Birr',
    cbeSubGeneric: 'Open CBE Mobile · or USSD *847#',
    cbeSubWithPhone: 'Send to this CBE Birr phone · or USSD *847#',
    cbeAccountLabel: 'CBE bank account',
    awashName: 'Awash Mobile',
    awashSubGeneric: 'Open Awash app · or USSD *901#',
    awashSubWithPhone: 'Send to this Awash phone · or USSD *901#',
    bankName: 'Other bank',
    bankSubWithPhone: 'Contact the shop on',
    bankSubNoContact: 'Pay in person or coordinate with the shop',
    accountNumberLabel: 'Account number',
    copy: 'Copy',
    copied: 'Copied!',
    tapToDial: 'Tap card to dial',
    privacy: '🔒 Gebya doesn\'t see your money. Pay direct to the shop, they\'ll confirm when it arrives.',
    poweredBy: 'Powered by Gebya · የንግድ ማስታወሻ',
    iPaidTitle: 'I’ve paid',
    iPaidSub: 'Tell the shop you’ve sent the payment',
    iPaidMsgPrefix: 'Hi, I just paid',
    iPaidMsgSuffix: 'birr for the credit. Please confirm.',
    iPaidViaTelegram: 'Notify via Telegram',
    iPaidViaSMS: 'Notify via SMS',
    iPaidConfirmTitle: 'Did you complete the payment?',
    iPaidConfirmBody: 'Only tap if you’ve actually sent the payment. The shop will be notified.',
    iPaidConfirmYes: 'Yes, notify shop',
    iPaidConfirmCancel: 'Not yet',
  },
  am: {
    title: 'ይክፈሉ ለ',
    youOwe: 'መክፈል ያለቦት',
    birr: 'ብር',
    from: 'ከ',
    forCredit: 'ለዱቤ',
    popular: 'በኢትዮጵያ በብዛት ጥቅም ላይ',
    bankTransfer: 'ባንክ ዝውውር',
    telebirrName: 'telebirr',
    telebirrSubGeneric: 'telebirr ይክፈቱ · ወይም *127# ይደውሉ',
    telebirrSubWithPhone: 'ለዚህ ስልክ በ telebirr ይላኩ · ወይም *127#',
    telebirrTag: '⭐ በብዛት',
    cbeName: 'CBE Birr',
    cbeSubGeneric: 'CBE Mobile ይክፈቱ · ወይም *847# ይደውሉ',
    cbeSubWithPhone: 'ለዚህ CBE Birr ስልክ ይላኩ · ወይም *847#',
    cbeAccountLabel: 'CBE ባንክ መለያ',
    awashName: 'Awash Mobile',
    awashSubGeneric: 'Awash ይክፈቱ · ወይም *901# ይደውሉ',
    awashSubWithPhone: 'ለዚህ Awash ስልክ ይላኩ · ወይም *901#',
    bankName: 'ሌላ ባንክ',
    bankSubWithPhone: 'ለመገናኘት',
    bankSubNoContact: 'በአካል ይክፈሉ ወይም ሱቅ ቤት ይገናኙ',
    accountNumberLabel: 'የመለያ ቁጥር',
    copy: 'ቅዳ',
    copied: 'ተቀዳ!',
    tapToDial: 'ለመደወል ይንኩ',
    privacy: '🔒 Gebya ገንዘብዎን አያይም። ለሱቁ በቀጥታ ይክፈሉ።',
    poweredBy: 'በ Gebya የተደገፈ · የንግድ ማስታወሻ',
    iPaidTitle: 'ከፍያለሁ',
    iPaidSub: 'ክፍያ መላክዎን ለሱቅ ይንገሩ',
    iPaidMsgPrefix: 'ሰላም፣ አሁን',
    iPaidMsgSuffix: 'ብር ለዱቤ ከፍያለሁ። እባክዎ ያረጋግጡ።',
    iPaidViaTelegram: 'በቴሌግራም ላክ',
    iPaidViaSMS: 'በSMS ላክ',
    iPaidConfirmTitle: 'ክፍያውን ጨርሰዋል?',
    iPaidConfirmBody: 'በትክክል ክፍያ ከላኩ ብቻ ይንኩ። ሱቁ ይነገራል።',
    iPaidConfirmYes: 'አዎ፣ ሱቁን አሳውቅ',
    iPaidConfirmCancel: 'ገና አይደለም',
  },
};

function PayPage() {
  const params = useMemo(() => readUrlParams(), []);
  const [copied, setCopied] = useState(null); // null | 'phone' | 'tg' | etc.
  // T2 (Q1 + queue): "I paid" callback — confirm modal then opens
  // shop's Telegram or SMS with a pre-filled "I just paid" message.
  const [showPaidConfirm, setShowPaidConfirm] = useState(false);
  const [paidSent, setPaidSent] = useState(false);
  const t = TEXT[params.lang] || TEXT.en;

  useEffect(() => {
    // Set page title for browser tab
    if (typeof document !== 'undefined' && params.to) {
      document.title = `${t.title} ${params.to}`;
    }
  }, [params.to, params.lang, t.title]);

  const copyText = async (text, key) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  // No-params fallback — show a friendly placeholder
  if (!params.to && !params.amount) {
    return (
      <div style={pageStyle()}>
        <div style={cardStyle()}>
          <p style={{ fontSize: '1rem', color: '#1f2937', textAlign: 'center' }}>
            This is a Gebya payment link page. Open a real link from a shop's reminder.
          </p>
        </div>
      </div>
    );
  }

  const amountDisplay = formatAmount(params.amount);

  return (
    <div style={pageStyle()}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 800, color: '#92400e', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {t.title}
          </p>
          <h1 style={{
            fontFamily: 'Manrope, system-ui, sans-serif',
            fontSize: '1.6rem', fontWeight: 800, marginTop: 4, color: '#1f2937',
            letterSpacing: '-0.02em',
          }}>
            {params.to || '—'}
          </h1>
          {params.from && (
            <p style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 4 }}>
              {t.from} <strong style={{ color: '#1f2937' }}>{params.from}</strong>
            </p>
          )}
        </div>

        {/* Amount card */}
        <div style={{
          background: '#fff',
          border: '1px solid #ece6d6',
          borderRadius: 14,
          padding: 22,
          textAlign: 'center',
          marginBottom: 22,
          boxShadow: '0 2px 8px -2px rgba(0,0,0,0.05)',
        }}>
          <p style={{
            fontSize: '0.7rem', fontWeight: 800,
            color: '#92400e', letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            {t.youOwe}
          </p>
          <p style={{
            fontFamily: 'Manrope, system-ui, sans-serif',
            fontSize: '2.4rem', fontWeight: 800, color: '#b8842c',
            margin: '8px 0 4px',
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {amountDisplay}
            <span style={{ fontSize: '1rem', color: '#9ca3af', marginLeft: 6, fontWeight: 600 }}>
              {t.birr}
            </span>
          </p>
          {params.ref && (
            <p style={{ fontSize: '0.62rem', color: '#9ca3af', marginTop: 4, fontFamily: 'JetBrains Mono, monospace' }}>
              ref · {params.ref}
            </p>
          )}
        </div>

        <p style={sectionLabelStyle()}>{t.popular}</p>

        {/* Telebirr — featured. Uses explicit `tb` if set, otherwise falls back
            to the shop's `phone` (most common case — shopkeepers receive
            telebirr on their own phone). */}
        <ChannelCard
          icon="💛"
          iconBg="#ffeb3b"
          iconColor="#1f2937"
          name={t.telebirrName}
          sub={(params.tb || params.phone) ? t.telebirrSubWithPhone : t.telebirrSubGeneric}
          tag={t.telebirrTag}
          tagBg="#d1f4e0"
          tagColor="#047857"
          accountValue={params.tb || params.phone}
          accountKey="tb"
          copyLabel={t.copy}
          copiedLabel={t.copied}
          copiedKey={copied}
          onCopy={copyText}
          onClick={() => { window.location.href = 'tel:*127%23'; }}
          featured
        />

        {/* CBE Birr — show phone if set; also show bank account as a second
            row when the shopkeeper has provided one. */}
        <ChannelCard
          icon="💜"
          iconBg="#5d3a98"
          iconColor="#fff"
          name={t.cbeName}
          sub={(params.cbe_p || params.cbe) ? t.cbeSubWithPhone : t.cbeSubGeneric}
          accountValue={params.cbe_p || params.cbe}
          accountKey="cbe_p"
          secondaryLabel={t.cbeAccountLabel}
          secondaryValue={params.cbe_a}
          secondaryKey="cbe_a"
          copyLabel={t.copy}
          copiedLabel={t.copied}
          copiedKey={copied}
          onCopy={copyText}
          onClick={() => { window.location.href = 'tel:*847%23'; }}
        />

        {/* Awash Mobile */}
        <ChannelCard
          icon="🟡"
          iconBg="#d4af37"
          iconColor="#1f2937"
          name={t.awashName}
          sub={(params.aw_p || params.awash) ? t.awashSubWithPhone : t.awashSubGeneric}
          accountValue={params.aw_p || params.awash}
          accountKey="aw_p"
          copyLabel={t.copy}
          copiedLabel={t.copied}
          copiedKey={copied}
          onCopy={copyText}
          onClick={() => { window.location.href = 'tel:*901%23'; }}
        />

        <p style={sectionLabelStyle()}>{t.bankTransfer}</p>

        {/* Bank / contact card.
            If the shopkeeper has set bk_n + bk_a (Commit C.1), this becomes a
            full bank-transfer card with the account number. Otherwise it
            falls back to a generic contact card with the shop's phone/Telegram. */}
        <div style={{
          background: '#fff',
          border: '1px solid #ece6d6',
          borderRadius: 12,
          padding: 14,
          marginBottom: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: '#1a1a1a', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem',
              flexShrink: 0,
            }}>🏦</div>
            <p style={{ flex: 1, fontSize: '0.92rem', fontWeight: 700, color: '#1f2937' }}>
              {params.bk_n ? params.bk_n : t.bankName}
            </p>
          </div>

          {/* Bank account if configured */}
          {params.bk_a && (
            <ContactRow
              label="#"
              value={params.bk_a}
              onCopy={() => copyText(params.bk_a, 'bk_a')}
              copied={copied === 'bk_a'}
              copyLabel={t.copy}
              copiedLabel={t.copied}
            />
          )}

          {/* Contact rows */}
          {(params.phone || params.tg) ? (
            <>
              <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '8px 0 6px' }}>
                {t.bankSubWithPhone}:
              </p>
              {params.phone && (
                <ContactRow
                  label="📞"
                  value={params.phone}
                  onCopy={() => copyText(params.phone, 'phone')}
                  copied={copied === 'phone'}
                  copyLabel={t.copy}
                  copiedLabel={t.copied}
                />
              )}
              {params.tg && (
                <ContactRow
                  label="💬"
                  value={params.tg}
                  onCopy={() => copyText(params.tg, 'tg')}
                  copied={copied === 'tg'}
                  copyLabel={t.copy}
                  copiedLabel={t.copied}
                />
              )}
            </>
          ) : !params.bk_a && (
            <p style={{ fontSize: '0.78rem', color: '#6b7280' }}>
              {t.bankSubNoContact}
            </p>
          )}
        </div>

        {/* T2: "I paid" callback — only if the customer has a way to message
            the shop back (phone or Telegram). Lets the customer ping the shop
            after they've completed the USSD transfer. */}
        {(params.phone || params.tg) && !paidSent && (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              background: '#f0fdf4',
              border: '1px solid #86efac',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: '0.62rem', fontWeight: 800, color: '#047857', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              {t.iPaidTitle}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#065f46', marginBottom: 10 }}>
              {t.iPaidSub}
            </p>
            <button
              type="button"
              onClick={() => setShowPaidConfirm(true)}
              style={{
                width: '100%',
                padding: '12px',
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                fontSize: '0.95rem',
                fontWeight: 800,
                cursor: 'pointer',
                minHeight: 48,
              }}
            >
              ✓ {t.iPaidTitle}
            </button>
          </div>
        )}

        {paidSent && (
          <div
            style={{
              marginTop: 18,
              padding: 14,
              background: '#dbeafe',
              border: '1px solid #93c5fd',
              borderRadius: 10,
              fontSize: '0.78rem',
              color: '#1e3a8a',
              textAlign: 'center',
              lineHeight: 1.55,
            }}
          >
            ✓ {params.lang === 'am'
              ? 'ሱቁ ተነገረ። ቀሪ ሂሳብዎ ሲረጋገጥ ይዘምናል።'
              : 'Shop has been notified. Your balance will update once confirmed.'}
          </div>
        )}

        {/* I-paid confirmation modal */}
        {showPaidConfirm && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,0,0.55)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16,
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowPaidConfirm(false); }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: 22,
                width: '100%', maxWidth: 380,
                boxShadow: '0 20px 40px -8px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ fontSize: '2.4rem', textAlign: 'center', marginBottom: 8 }}>💸</div>
              <h3
                style={{
                  fontSize: '1.1rem', fontWeight: 800,
                  color: '#065f46', textAlign: 'center', marginBottom: 6,
                }}
              >
                {t.iPaidConfirmTitle}
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', textAlign: 'center', marginBottom: 16 }}>
                {t.iPaidConfirmBody}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* If shop has Telegram, prefer that — guarantees delivery */}
                {params.tg && (
                  <button
                    type="button"
                    onClick={() => {
                      const tgHandle = String(params.tg).replace(/^@/, '');
                      const msg = `${t.iPaidMsgPrefix} ${params.amount || ''} ${t.iPaidMsgSuffix}`;
                      const url = `https://t.me/${tgHandle}?text=${encodeURIComponent(msg)}`;
                      window.open(url, '_blank', 'noopener,noreferrer');
                      setShowPaidConfirm(false);
                      setPaidSent(true);
                    }}
                    style={{
                      width: '100%', padding: 14,
                      background: '#0088cc', color: '#fff',
                      border: 'none', borderRadius: 12,
                      fontSize: '0.95rem', fontWeight: 800,
                      cursor: 'pointer', minHeight: 48,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    💬 {t.iPaidViaTelegram}
                  </button>
                )}
                {/* SMS fallback if there's a phone number on file */}
                {params.phone && (
                  <button
                    type="button"
                    onClick={() => {
                      const msg = `${t.iPaidMsgPrefix} ${params.amount || ''} ${t.iPaidMsgSuffix}`;
                      const url = `sms:${params.phone}?body=${encodeURIComponent(msg)}`;
                      window.location.href = url;
                      setShowPaidConfirm(false);
                      setPaidSent(true);
                    }}
                    style={{
                      width: '100%', padding: 14,
                      background: '#16a34a', color: '#fff',
                      border: 'none', borderRadius: 12,
                      fontSize: '0.95rem', fontWeight: 800,
                      cursor: 'pointer', minHeight: 48,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    📱 {t.iPaidViaSMS}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPaidConfirm(false)}
                  style={{
                    width: '100%', padding: 14,
                    background: '#f3f4f6', color: '#374151',
                    border: 'none', borderRadius: 12,
                    fontSize: '0.9rem', fontWeight: 700,
                    cursor: 'pointer', minHeight: 48,
                  }}
                >
                  {t.iPaidConfirmCancel}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Privacy line · explicit */}
        <div style={{
          marginTop: 18,
          padding: 14,
          background: '#f0fdf4',
          border: '1px solid #a3e9c1',
          borderRadius: 10,
          fontSize: '0.78rem',
          color: '#064e3b',
          textAlign: 'center',
          lineHeight: 1.55,
        }}>
          {t.privacy}
        </div>

        {/* Footer */}
        <p style={{
          textAlign: 'center', marginTop: 18,
          fontSize: '0.7rem', color: '#9ca3af',
        }}>
          {t.poweredBy}
        </p>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────
function pageStyle() {
  return {
    minHeight: '100svh',
    background: '#f9f6f0',
    fontFamily: "'Inter', 'Noto Sans Ethiopic', system-ui, sans-serif",
    color: '#1f2937',
    padding: 0,
  };
}
function cardStyle() {
  return {
    maxWidth: 480, margin: '40px auto', padding: 24,
    background: '#fff', border: '1px solid #ece6d6', borderRadius: 14,
  };
}
function sectionLabelStyle() {
  return {
    fontSize: '0.62rem', fontWeight: 800,
    color: '#9ca3af', letterSpacing: '0.12em', textTransform: 'uppercase',
    margin: '12px 4px 6px',
  };
}

// Channel card with optional account-number row.
//
// When `accountValue` is provided, an inline row appears under the channel
// name with the account number and a Copy button. The card itself is still
// tappable to dial the USSD code — but tapping the Copy button stops
// propagation so it doesn't dial accidentally.
//
// Commit C.1: also supports a `secondaryValue` (e.g. CBE bank account in
// addition to CBE Birr phone). Each row has its own copy state via copyKey.
function ChannelCard({
  icon, iconBg, iconColor, name, sub, tag, tagBg, tagColor, onClick, featured,
  accountValue, accountKey, secondaryLabel, secondaryValue, secondaryKey,
  copyLabel, copiedLabel, copiedKey, onCopy,
}) {
  const hasAccount = !!accountValue;
  const hasSecondary = !!secondaryValue;
  const handleCardClick = (e) => {
    // Don't trigger when the user is tapping inside a copy button or input
    if (e.target.closest('[data-copy-button]')) return;
    onClick?.();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(e); }}
      style={{
        width: '100%',
        background: featured ? 'linear-gradient(135deg, #f0fdf4 0%, #fff 100%)' : '#fff',
        border: `1px solid ${featured ? '#a3e9c1' : '#ece6d6'}`,
        borderRadius: 12,
        padding: 14,
        marginBottom: 6,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: iconBg, color: iconColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.4rem',
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 6 }}>
            {name}
            {tag && (
              <span style={{
                display: 'inline-block',
                fontSize: '0.58rem', fontWeight: 800,
                background: tagBg, color: tagColor,
                padding: '2px 6px', borderRadius: 4,
                letterSpacing: '0.04em',
              }}>
                {tag}
              </span>
            )}
          </p>
          <p style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{sub}</p>
        </div>
        <span style={{ fontSize: '1.1rem', color: '#9ca3af' }}>→</span>
      </div>

      {/* Account-number row (Commit C.1) — visible when shopkeeper has set
          an explicit account on this channel. Tap to copy, doesn't dial. */}
      {hasAccount && (
        <div
          data-copy-button
          style={{
            marginTop: 10,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 8,
          }}
        >
          <span
            style={{
              flex: 1,
              fontSize: '0.92rem',
              fontWeight: 800,
              color: '#1f2937',
              fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}
          >
            {accountValue}
          </span>
          <button
            type="button"
            data-copy-button
            onClick={(e) => { e.stopPropagation(); onCopy?.(accountValue, accountKey); }}
            style={{
              background: copiedKey === accountKey ? '#047857' : '#1a1a1a',
              color: '#fff',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: '0.72rem', fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {copiedKey === accountKey ? `✓ ${copiedLabel}` : copyLabel}
          </button>
        </div>
      )}

      {/* Secondary row — e.g. CBE bank account number alongside CBE Birr phone */}
      {hasSecondary && (
        <div
          data-copy-button
          style={{
            marginTop: 6,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px',
            background: 'rgba(0,0,0,0.04)',
            border: '1px solid rgba(0,0,0,0.06)',
            borderRadius: 8,
          }}
        >
          {secondaryLabel && (
            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#6b7280', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              {secondaryLabel}
            </span>
          )}
          <span
            style={{
              flex: 1,
              fontSize: '0.88rem',
              fontWeight: 800,
              color: '#1f2937',
              fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {secondaryValue}
          </span>
          <button
            type="button"
            data-copy-button
            onClick={(e) => { e.stopPropagation(); onCopy?.(secondaryValue, secondaryKey); }}
            style={{
              background: copiedKey === secondaryKey ? '#047857' : '#1a1a1a',
              color: '#fff',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: '0.7rem', fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {copiedKey === secondaryKey ? `✓ ${copiedLabel}` : copyLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function ContactRow({ label, value, onCopy, copied, copyLabel, copiedLabel }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px',
      background: '#f9f6f0',
      border: '1px solid #ece6d6',
      borderRadius: 8,
      marginBottom: 4,
    }}>
      <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 700, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
      <button
        type="button"
        onClick={onCopy}
        style={{
          background: copied ? '#047857' : '#1a1a1a',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: '0.7rem', fontWeight: 800,
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {copied ? `✓ ${copiedLabel}` : copyLabel}
      </button>
    </div>
  );
}

export default PayPage;

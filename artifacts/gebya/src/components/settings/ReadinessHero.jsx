export default function ReadinessHero({ shopProfile, paymentChannels = [], catalogEntries = [], recurring = [], lang }) {
  const name = shopProfile?.name || '';
  const initials = (() => {
    if (!name) return '?';
    const parts = name.split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
  })();

  const profileScore = (() => {
    if (!shopProfile?.name) return 0;
    let s = 60;
    if (shopProfile.phone) s += 25;
    if (shopProfile.telegram) s += 15;
    return Math.min(s, 100);
  })();
  const channelsTotal = paymentChannels.length || 1;
  const channelsConfigured = paymentChannels.filter(c => c.enabled && (
    c.usePhoneFromShop || c.phone || c.account
  )).length;
  const channelScore = Math.round((channelsConfigured / channelsTotal) * 100);
  const itemsScore = (catalogEntries || []).filter(e => e.active !== false).length > 0 ? 100 : 0;
  const recurringScore = (recurring || []).length > 0 ? 100 : 0;
  const overallPct = Math.round(
    profileScore * 0.40 + channelScore * 0.40 + itemsScore * 0.10 + recurringScore * 0.10
  );

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #1B4332 0%, #2d6a4f 100%)',
        color: '#fff',
        borderRadius: 18,
        padding: '14px 16px 16px',
        boxShadow: '0 4px 16px -8px rgba(27,67,50,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div
          style={{
            width: 46, height: 46, borderRadius: '50%',
            background: '#C4883A',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 900, fontSize: '1.05rem',
            border: '2px solid rgba(255,255,255,0.25)',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.66rem', opacity: 0.7, fontWeight: 600 }}>
            {lang === 'am' ? 'ሰላም' : 'Hi'}
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name || (lang === 'am' ? 'ሱቅ' : 'Shop')}
          </div>
          <div style={{ fontSize: '0.65rem', opacity: 0.65, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {shopProfile?.phone || (lang === 'am' ? 'ስልክ አልተጨመረም' : 'No phone added')}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          padding: '9px 12px',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {lang === 'am' ? 'ዝግጁ ነው' : 'Setup ready'}
          </div>
          <div style={{ fontFamily: 'Manrope, system-ui, sans-serif', fontSize: '1.1rem', fontWeight: 800, color: '#fde68a', lineHeight: 1 }}>
            {overallPct}%
          </div>
        </div>
        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 999, overflow: 'hidden', maxWidth: 120 }}>
          <div
            style={{
              height: '100%',
              width: `${overallPct}%`,
              background: 'linear-gradient(90deg, #fde68a 0%, #fbbf24 100%)',
              borderRadius: 999,
              transition: 'width .3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
}

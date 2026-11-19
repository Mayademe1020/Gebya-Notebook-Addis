/**
 * AdminDashboard — platform-wide metrics + quick actions for the Gebya team.
 * Access: Settings → Dev Mode → Platform Admin
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLang } from '../context/LangContext';
import { apiFetch } from '../utils/shared-ui.jsx';
import { label } from '../labels/index.js';

function fmt(n) { return n == null ? '0' : Number(n).toLocaleString('en-US'); }
function fmtBirr(n) { return `${fmt(n)} ETB`; }
function pct(a, b) { return !b ? '0%' : `${Math.round((a / b) * 100)}%`; }

function Section({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--color-border)', boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 12px 30px -18px rgba(16,24,40,0.22)' }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'linear-gradient(90deg, rgba(27,67,50,0.05), rgba(27,67,50,0))' }}>
        <span className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg, var(--color-primary), var(--color-accent-amber))' }} />
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>{title}</p>
          {subtitle && <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-soft)' }}>{subtitle}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatRow({ label, value, tone }) {
  const color = tone === 'green' ? 'var(--color-success-text)' : tone === 'amber' ? 'var(--color-warning)' : tone === 'red' ? 'var(--color-danger-text)' : 'var(--color-text)';
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{label}</span>
      <span className="text-xs font-black" style={{ color }}>{value}</span>
    </div>
  );
}

function Bar({ value, max, color = 'var(--color-primary)' }) {
  const w = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (<div className="w-full h-1.5 rounded-full" style={{ background: 'var(--color-bg-hover)' }}><div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} /></div>);
}

function FrictionCount({ label, value }) {
  return (
    <div className="rounded-xl p-2" style={{ background: 'var(--color-surface-subtle)' }}>
      <div className="text-lg font-black" style={{ color: value > 0 ? 'var(--color-warning)' : 'var(--color-success-text)' }}>{value}</div>
      <div className="text-[10px] font-bold" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}

function FrictionGroup({ title, items, badge, onOpen }) {
  if (!items || items.length === 0) return null;
  return (
    <Section title={title}>
      <div className="space-y-1">
        {items.map((it, i) => (
          <div key={(it.businessId ?? i) + '-' + i} className="flex items-center justify-between gap-2 py-1.5 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">{it.name}</div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{it.ownerPhone}{badge ? ` · ${badge(it)}` : ''}</div>
            </div>
            <button
              onClick={() => onOpen({ id: it.businessId, name: it.name, ownerPhone: it.ownerPhone })}
              className="px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              Open
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function SkeletonSection({ title }) {
  return (
    <Section title={title}>
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-3 rounded" style={{ width: `${92 - i * 16}%`, background: 'var(--color-bg-hover)' }} />
        ))}
      </div>
    </Section>
  );
}

function ErrorCard({ msg, onRetry }) {
  const { lang } = useLang();
  return (
    <div className="rounded-2xl border p-6 text-center" style={{ borderColor: 'var(--color-border)' }}>
      <p className="text-sm font-black mb-1" style={{ color: 'var(--color-danger-text)' }}>{label('admin.couldn-t-load', lang)}</p>
      <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{msg}</p>
      <button onClick={onRetry} className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: 'var(--color-primary)' }}>
        {label('admin.retry', lang)}
      </button>
    </div>
  );
}

function relTime(ts, now) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

export default function AdminDashboard({ onShopSelect, tab = 'overview' }) {
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [shops, setShops] = useState(null);
  const [features, setFeatures] = useState(null);
  const [frictions, setFrictions] = useState(null);
  const [errors, setErrors] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const setErr = (name, msg) => setErrors((e) => ({ ...e, [name]: msg || null }));
  const [shopSearch, setShopSearch] = useState('');
  const SHOPS_LIMIT = 200;
  const [shopOffset, setShopOffset] = useState(0);
  const [shopHasMore, setShopHasMore] = useState(false);
  const shopTimer = useRef(null);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const loadSection = (name, attempt = 1) => {
    setErr(name, null);
    const map = {
      overview: ['/admin/overview', setData],
      shops: [`/admin/shops?limit=${SHOPS_LIMIT}&offset=0`, setShops],
      features: ['/admin/features', setFeatures],
      frictions: ['/admin/frictions', setFrictions],
    };
    const [path, setter] = map[name];
    apiFetch(path)
      .then((v) => { setter(v); setErr(name, null); setLastUpdated(Date.now()); })
      .catch((err) => {
        const msg = String(err?.message || 'Failed to load');
        const warming = /warming up|warming|abort|timed out|signal/i.test(msg);
        // Server returns 503 "warming up" (or the client fetch times out) while a
        // cold-cache compute runs in the background. Retry with backoff so the user
        // sees data once it lands instead of a dead-end error.
        if (warming && attempt < 3) { setTimeout(() => loadSection(name, attempt + 1), attempt === 1 ? 2000 : 4000); return; }
        setErr(name, msg);
      });
  };

  useEffect(() => {
    ['overview', 'shops', 'features', 'frictions'].forEach((n) => loadSection(n));
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Server-backed shop search + pagination (fixes the old 500-row cap). The
  // initial load (above) fetches the first page; search and "Load more" refetch
  // through here. Results are cached+L2 on the server, so repeated searches are
  // cheap once warm.
  const fetchShops = useCallback(async (q, offset, append) => {
    try {
      const data = await apiFetch(`/admin/shops?q=${encodeURIComponent(q)}&limit=${SHOPS_LIMIT}&offset=${offset}`);
      setShops((prev) => {
        const base = append && prev ? prev.shops : [];
        return { ...data, shops: [...base, ...(data.shops || [])] };
      });
      setShopOffset(offset + (data.shops?.length || 0));
      return data;
    } catch (e) {
      setErr('shops', String(e?.message || 'Failed to load'));
      return null;
    }
  }, [SHOPS_LIMIT]);

  useEffect(() => {
    if (shops) setShopHasMore((shops.shops?.length || 0) >= SHOPS_LIMIT);
  }, [shops]);

  const d = data;

  return (
    <div className="space-y-4 pb-8">
      {tab !== 'actions' && lastUpdated && (
        <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
          <span>{label('admin.updated', lang, relTime(lastUpdated, nowTick))}</span>
          <button onClick={() => ['overview', 'shops', 'features', 'frictions'].forEach((n) => loadSection(n))} className="underline font-bold">{label('admin.refresh', lang)}</button>
        </div>
      )}

      {tab === 'overview' && (
        errors.overview ? <ErrorCard msg={errors.overview} onRetry={() => loadSection('overview')} /> :
        !data ? <SkeletonSection title={label('admin.platform-numbers', lang)} /> :
        (<>
          <Section title="Platform Numbers">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: 'Shops', value: fmt(d.platformNumbers.shops) }, { label: 'Users', value: fmt(d.platformNumbers.users) }, { label: 'Devices', value: fmt(d.platformNumbers.devices) }, { label: 'Transactions', value: fmt(d.platformNumbers.transactions) }, { label: 'Sales', value: fmtBirr(d.platformNumbers.totalSalesBirr) }, { label: 'Credit', value: fmtBirr(d.platformNumbers.totalCreditBirr) }].map(s => (
              <div key={s.label} className="text-center p-3 rounded-2xl" style={{ background: '#fff', border: '1px solid var(--color-border)', boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 22px -16px rgba(16,24,40,0.25)' }}><p className="text-xl font-black" style={{ color: 'var(--color-primary)' }}>{s.value}</p><p className="text-[10px] font-bold mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p></div>
            ))}
          </div>
        </Section>
        <Section title="Onboarding Funnel" subtitle="From registration to activity">
          {[{ label: 'Registered', value: d.onboardingFunnel.registered }, { label: 'Created Shop', value: d.onboardingFunnel.createdShop }, { label: 'First Transaction', value: d.onboardingFunnel.madeFirstTxn }, { label: 'Active (7d)', value: d.onboardingFunnel.activeWeek }, { label: 'Active Today', value: d.onboardingFunnel.activeToday }].map((s, i) => (
            <div key={s.label}><div className="flex justify-between items-center py-1"><span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{s.label}</span><span className="text-xs font-black" style={{ color: 'var(--color-text)' }}>{s.value} {i > 0 && d.onboardingFunnel.registered > 0 && <span style={{ color: 'var(--color-text-soft)' }}>({pct(s.value, d.onboardingFunnel.registered)})</span>}</span></div><Bar value={s.value} max={d.onboardingFunnel.registered} /></div>
          ))}
        </Section>
        <Section title="Credit Overview">
          <StatRow label="Total Extended" value={fmtBirr(d.creditOverview.totalExtended)} />
          <StatRow label="Total Repaid" value={fmtBirr(d.creditOverview.totalRepaid)} />
          <StatRow label="Recovery Rate" value={pct(d.creditOverview.recoveryRate, 100)} tone={d.creditOverview.recoveryRate >= 70 ? 'green' : 'amber'} />
          <StatRow label="Outstanding" value={fmtBirr(d.creditOverview.outstandingBalance)} />
          <StatRow label="Overdue Exposure" value={fmtBirr(d.creditOverview.overdueExposure)} tone={d.creditOverview.overdueExposure > 0 ? 'red' : 'green'} />
        </Section>
        <Section title="Growth Timeline" subtitle="Last 14 days">
          <div className="space-y-1">
            {d.growthTimeline.map(day => (
              <div key={day.date} className="flex items-center gap-2 text-[10px]">
                <span className="w-16 font-bold" style={{ color: 'var(--color-text-muted)' }}>{day.date.slice(5)}</span>
                <div className="flex-1 flex items-center gap-1"><span className="w-6 text-right font-bold" style={{ color: 'var(--color-primary)' }}>{day.shops}</span><div className="flex-1"><Bar value={day.shops} max={Math.max(...d.growthTimeline.map(d => d.shops), 1)} /></div></div>
                <div className="flex-1 flex items-center gap-1"><span className="w-6 text-right font-bold" style={{ color: 'var(--color-accent-amber)' }}>{day.users}</span><div className="flex-1"><Bar value={day.users} max={Math.max(...d.growthTimeline.map(d => d.users), 1)} color='var(--color-accent-amber)' /></div></div>
              </div>
            ))}
          </div>
        </Section>
      </>))}

      {tab === 'shops' && (
        errors.shops ? <ErrorCard msg={errors.shops} onRetry={() => loadSection('shops')} /> :
        !shops ? <SkeletonSection title={label('admin.shop-health-table', lang)} /> :
        (<Section title="Shop Health Table">
           <div className="mb-2">
             <input
               type="text"
               value={shopSearch}
                onChange={(e) => {
                  const v = e.target.value;
                  setShopSearch(v);
                  if (shopTimer.current) clearTimeout(shopTimer.current);
                  shopTimer.current = setTimeout(() => {
                    setShopOffset(0);
                    fetchShops(v, 0, false);
                  }, 350);
                }}
               placeholder={label('admin.search-shops', lang)}
               className="w-full px-3 py-2 rounded-xl text-xs border-2 focus:outline-none"
               style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-subtle)' }}
             />
           </div>
            <div className="overflow-x-auto">
                 <table className="w-full text-[10px]">
                   <thead><tr style={{ color: 'var(--color-text-muted)' }}><th className="text-left py-1 font-bold">Shop</th><th className="text-left py-1 font-bold">Phone</th><th className="text-right py-1 font-bold">Txns</th><th className="text-right py-1 font-bold">Sales</th><th className="text-center py-1 font-bold">Status</th><th className="text-center py-1 font-bold">Detail</th></tr></thead>
                   <tbody>                    {shops.shops.map(shop => (
                     <tr key={shop.id} className="border-t" style={{ borderColor: 'var(--color-border-light)' }}>
                       <td className="py-1.5 font-bold" style={{ color: 'var(--color-text)' }}>{shop.name}</td>
                       <td className="py-1.5" style={{ color: 'var(--color-text-muted)' }}>{shop.ownerPhone}</td>
                       <td className="py-1.5 text-right" style={{ color: 'var(--color-text)' }}>{shop.totalTransactions}</td>
                       <td className="py-1.5 text-right" style={{ color: 'var(--color-text)' }}>{fmt(shop.totalSalesBirr)}</td>
                       <td className="py-1.5 text-center"><span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: shop.status === 'active' ? 'var(--color-success-bg)' : shop.status === 'dormant' ? 'var(--color-warning-bg)' : 'var(--color-bg-hover)', color: shop.status === 'active' ? 'var(--color-success-text)' : shop.status === 'dormant' ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>{shop.status}</span></td>
                       <td className="py-1.5 text-center">
                         <button
                           onClick={() => onShopSelect?.(shop)}
                           className="px-2 py-1 rounded-lg text-[10px] font-bold"
                           style={{ background: 'var(--color-primary)', color: 'var(--color-bg-white)' }}
                         >
                           {label('admin.open', lang)}
                         </button>
                       </td>
                     </tr>
                   ))}
                    {shops.shops.length === 0 && (
                     <tr><td colSpan={6} className="py-3 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>{label('admin.no-shops-found', lang)}</td></tr>
                   )}
                 </tbody>
                 </table>
                </div>
              {shopHasMore && (
                <button
                  onClick={() => fetchShops(shopSearch, shopOffset, true)}
                  className="mt-2 w-full py-2 rounded-xl text-xs font-bold"
                  style={{ background: 'var(--color-surface-subtle)', color: 'var(--color-text)' }}
                >
                  {label('admin.load-more', lang)}
                </button>
              )}
           </Section>
        ))}
      {tab === 'features' && (
        errors.features ? <ErrorCard msg={errors.features} onRetry={() => loadSection('features')} /> :
        !features ? <SkeletonSection title={label('admin.feature-adoption', lang)} /> :
        (<>
          <Section title="Feature Adoption">
        <StatRow label="Using Credit" value={`${features.features.shopsUsingCredit}/${d?.platformNumbers?.shops ?? 0}`} />
        <StatRow label="Using Suppliers" value={`${features.features.shopsUsingSuppliers}/${d?.platformNumbers?.shops ?? 0}`} />
        <StatRow label="Using Telegram" value={`${features.features.shopsUsingTelegram}/${d?.platformNumbers?.shops ?? 0}`} />
        </Section>
        <Section title="Payment Methods">
          {Object.entries(features.paymentMethods).sort((a, b) => b[1] - a[1]).map(([method, count]) => (
            <div key={method}><div className="flex justify-between items-center py-1"><span className="text-xs font-bold" style={{ color: 'var(--color-text)' }}>{method}</span><span className="text-xs font-black" style={{ color: 'var(--color-text)' }}>{count}</span></div><Bar value={count} max={Math.max(...Object.values(features.paymentMethods))} /></div>
          ))}
        </Section>
      </>))}
      {tab === 'frictions' && (
        errors.frictions ? <ErrorCard msg={errors.frictions} onRetry={() => loadSection('frictions')} /> :
        !frictions ? <SkeletonSection title={label('admin.friction-summary', lang)} /> :
        (<>
          <Section title="Friction Summary" subtitle="Shops that may need help">
          <div className="grid grid-cols-2 gap-2">
            <FrictionCount label="Dormant (no txn 7d)" value={frictions.counts.dormantShops} />
            <FrictionCount label="Zero transactions" value={frictions.counts.zeroTransactionShops} />
            <FrictionCount label="Stuck in onboarding" value={frictions.counts.onboardingStuck} />
            <FrictionCount label="Orphaned (no owner)" value={frictions.counts.orphanedShops} />
            <FrictionCount label="Owner no Telegram" value={frictions.counts.ownerTelegramNotLinked} />
            <FrictionCount label="Low TG adoption" value={frictions.counts.lowTelegramAdoption} />
            <FrictionCount label="Reminder failures" value={frictions.counts.deliveryFailures} />
          </div>
          <div className="mt-2 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>SMS platform: {frictions.smsEnabled ? 'enabled' : 'disabled'}</div>
        </Section>

        <FrictionGroup title="Dormant shops" items={frictions.samples.dormantShops} onOpen={onShopSelect} />
        <FrictionGroup title="Zero-transaction shops" items={frictions.samples.zeroTransactionShops} onOpen={onShopSelect} />
        <FrictionGroup title="Stuck in onboarding (new, no sales)" items={frictions.samples.onboardingStuck} onOpen={onShopSelect} />
        <FrictionGroup title="Orphaned shops (no owner)" items={frictions.samples.orphanedShops} onOpen={onShopSelect} />
        <FrictionGroup title="Owners without Telegram" items={frictions.samples.ownerTelegramNotLinked} onOpen={onShopSelect} />
        <FrictionGroup title="Low Telegram adoption (<30%)" items={frictions.samples.lowTelegramAdoption} badge={(i) => i.adoption + '%'} onOpen={onShopSelect} />
        <FrictionGroup title="Reminder delivery failures" items={frictions.samples.deliveryFailures} badge={(i) => i.failures + ' failed'} onOpen={onShopSelect} />
      </>))}
      {tab === 'actions' && (<>

        <Section title="Refresh Data">
          <button onClick={() => ['overview', 'shops', 'features', 'frictions'].forEach((n) => loadSection(n))} className="w-full py-2.5 rounded-xl text-xs font-bold text-white min-h-[44px]" style={{ background: 'var(--color-primary)' }}>Refresh Dashboard</button>
        </Section>

        <Section title="Broadcast Notification" subtitle="Send in-app notification to all shops">
          <div className="space-y-3">
            <input type="text" value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none" style={{ borderColor: 'var(--color-border)' }} />
            <textarea value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)} placeholder="Message body" rows={3} className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none resize-none" style={{ borderColor: 'var(--color-border)' }} />
            {broadcastResult && <div className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: broadcastResult.ok ? 'var(--color-success-bg)' : 'var(--color-danger-bg)', color: broadcastResult.ok ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>{broadcastResult.ok ? `Sent to ${broadcastResult.sent}/${broadcastResult.total} shops` : `Failed: ${broadcastResult.error}`}</div>}
            <button onClick={async () => {
              if (!broadcastTitle || !broadcastBody) return;
              setBroadcastSending(true); setBroadcastResult(null);
              try {
                const result = await apiFetch('/admin/broadcast', { method: 'POST', body: JSON.stringify({ title: broadcastTitle, body: broadcastBody, type: 'announcement' }) }); setBroadcastResult(result);
                if (result.ok) { setBroadcastTitle(''); setBroadcastBody(''); }
              } catch (err) { setBroadcastResult({ ok: false, error: err.message }); }
              setBroadcastSending(false);
            }} disabled={broadcastSending || !broadcastTitle || !broadcastBody} className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]" style={{ background: broadcastSending || !broadcastTitle || !broadcastBody ? 'var(--color-bg-disabled)' : 'var(--color-accent-amber)', color: broadcastSending || !broadcastTitle || !broadcastBody ? 'var(--color-text-soft)' : 'var(--color-bg-white)' }}>
              {broadcastSending ? '...' : 'Send to All Shops'}
            </button>
          </div>
        </Section>

        <Section title="Push Notification" subtitle="Send browser push to all subscribed devices">
          <div className="space-y-3">
            <input type="text" value={pushTitle} onChange={e => setPushTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none" style={{ borderColor: 'var(--color-border)' }} />
            <textarea value={pushBody} onChange={e => setPushBody(e.target.value)} placeholder="Message body" rows={2} className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none resize-none" style={{ borderColor: 'var(--color-border)' }} />
            {pushResult && <div className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: pushResult.ok ? 'var(--color-success-bg)' : 'var(--color-danger-bg)', color: pushResult.ok ? 'var(--color-success-text)' : 'var(--color-danger-text)' }}>{pushResult.ok ? `Pushed: ${pushResult.sent}/${pushResult.total} (${pushResult.failed} failed)` : `Failed: ${pushResult.error}`}</div>}
            <button onClick={async () => {
              if (!pushTitle || !pushBody) return;
              setPushSending(true); setPushResult(null);
              try {
                const result = await apiFetch('/admin/push-all', { method: 'POST', body: JSON.stringify({ title: pushTitle, body: pushBody }) }); setPushResult(result);
                if (result.ok) { setPushTitle(''); setPushBody(''); }
              } catch (err) { setPushResult({ ok: false, error: err.message }); }
              setPushSending(false);
            }} disabled={pushSending || !pushTitle || !pushBody} className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]" style={{ background: pushSending || !pushTitle || !pushBody ? 'var(--color-bg-disabled)' : 'var(--color-info)', color: pushSending || !pushTitle || !pushBody ? 'var(--color-text-soft)' : 'var(--color-bg-white)' }}>
              {pushSending ? '...' : 'Send Push Notification'}
            </button>
          </div>
        </Section>

        <Section title="Export Shop List" subtitle="Download CSV of all shops">
          <button onClick={async () => {
            const csv = await apiFetch('/admin/export-shops');
            const blob = new Blob([typeof csv === 'string' ? csv : JSON.stringify(csv)], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `gebya-shops-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
          }} className="w-full py-2.5 rounded-xl text-xs font-bold text-white min-h-[44px]" style={{ background: 'var(--color-text)' }}>Download CSV</button>
        </Section>
      </>)}

      {data && <p className="text-center text-[9px]" style={{ color: 'var(--color-text-soft)' }}>Generated {new Date(d.generatedAt).toLocaleString()}</p>}
    </div>
  );
}

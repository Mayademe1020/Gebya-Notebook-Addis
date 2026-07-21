/**
 * AdminDashboard — platform-wide metrics + quick actions for the Gebya team.
 * Access: Settings → Dev Mode → Platform Admin
 */
import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { getAuthToken } from '../utils/syncEngine';

const API_BASE = (import.meta.env.VITE_SYNC_API_URL || '/api').replace(/\/$/, '');

async function apiFetch(path) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmt(n) { return n == null ? '0' : Number(n).toLocaleString('en-US'); }
function fmtBirr(n) { return `${fmt(n)} ETB`; }
function pct(a, b) { return !b ? '0%' : `${Math.round((a / b) * 100)}%`; }

function Section({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e2d8' }}>
      <div className="px-4 py-3 border-b" style={{ borderColor: '#f3f4f6' }}>
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#6b7280' }}>{title}</p>
        {subtitle && <p className="text-[10px] mt-0.5" style={{ color: '#9ca3af' }}>{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function StatRow({ label, value, tone }) {
  const color = tone === 'green' ? '#166534' : tone === 'amber' ? '#92400e' : tone === 'red' ? '#991b1b' : '#111827';
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs font-bold" style={{ color: '#374151' }}>{label}</span>
      <span className="text-xs font-black" style={{ color }}>{value}</span>
    </div>
  );
}

function Bar({ value, max, color = '#1B4332' }) {
  const w = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (<div className="w-full h-1.5 rounded-full" style={{ background: '#f3f4f6' }}><div className="h-full rounded-full" style={{ width: `${w}%`, background: color }} /></div>);
}

export default function AdminDashboard() {
  const { lang } = useLang();
  const [data, setData] = useState(null);
  const [shops, setShops] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushSending, setPushSending] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([apiFetch('/admin/overview'), apiFetch('/admin/shops'), apiFetch('/admin/features')])
      .then(([ov, sh, fe]) => { setData(ov); setShops(sh); setFeatures(fe); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  };
  useEffect(() => { loadData(); }, []);

  if (loading) return <div className="p-6 text-sm" style={{ color: '#6b7280' }}>Loading admin dashboard...</div>;
  if (error) return <div className="p-6 text-sm text-red-500">Error: {error}</div>;
  if (!data) return null;
  const d = data;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#f3f4f6' }}>
        {[{ id: 'overview', label: 'Overview' }, { id: 'shops', label: 'Shops' }, { id: 'features', label: 'Features' }, { id: 'actions', label: 'Actions' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="flex-1 py-2 rounded-lg text-xs font-bold transition-all" style={tab === t.id ? { background: '#1B4332', color: '#fff' } : { color: '#6b7280' }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (<>
        <Section title="Platform Numbers">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: 'Shops', value: fmt(d.platformNumbers.shops) }, { label: 'Users', value: fmt(d.platformNumbers.users) }, { label: 'Devices', value: fmt(d.platformNumbers.devices) }, { label: 'Transactions', value: fmt(d.platformNumbers.transactions) }, { label: 'Sales', value: fmtBirr(d.platformNumbers.totalSalesBirr) }, { label: 'Credit', value: fmtBirr(d.platformNumbers.totalCreditBirr) }].map(s => (
              <div key={s.label} className="text-center p-2 rounded-xl" style={{ background: '#fafaf9' }}><p className="text-lg font-black" style={{ color: '#1B4332' }}>{s.value}</p><p className="text-[10px] font-bold" style={{ color: '#6b7280' }}>{s.label}</p></div>
            ))}
          </div>
        </Section>
        <Section title="Onboarding Funnel" subtitle="From registration to activity">
          {[{ label: 'Registered', value: d.onboardingFunnel.registered }, { label: 'Created Shop', value: d.onboardingFunnel.createdShop }, { label: 'First Transaction', value: d.onboardingFunnel.madeFirstTxn }, { label: 'Active (7d)', value: d.onboardingFunnel.activeWeek }, { label: 'Active Today', value: d.onboardingFunnel.activeToday }].map((s, i) => (
            <div key={s.label}><div className="flex justify-between items-center py-1"><span className="text-xs font-bold" style={{ color: '#374151' }}>{s.label}</span><span className="text-xs font-black" style={{ color: '#111827' }}>{s.value} {i > 0 && d.onboardingFunnel.registered > 0 && <span style={{ color: '#9ca3af' }}>({pct(s.value, d.onboardingFunnel.registered)})</span>}</span></div><Bar value={s.value} max={d.onboardingFunnel.registered} /></div>
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
                <span className="w-16 font-bold" style={{ color: '#6b7280' }}>{day.date.slice(5)}</span>
                <div className="flex-1 flex items-center gap-1"><span className="w-6 text-right font-bold" style={{ color: '#1B4332' }}>{day.shops}</span><div className="flex-1"><Bar value={day.shops} max={Math.max(...d.growthTimeline.map(d => d.shops), 1)} /></div></div>
                <div className="flex-1 flex items-center gap-1"><span className="w-6 text-right font-bold" style={{ color: '#C4883A' }}>{day.users}</span><div className="flex-1"><Bar value={day.users} max={Math.max(...d.growthTimeline.map(d => d.users), 1)} color="#C4883A" /></div></div>
              </div>
            ))}
          </div>
        </Section>
      </>)}

      {tab === 'shops' && shops && (
        <Section title="Shop Health Table">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead><tr style={{ color: '#6b7280' }}><th className="text-left py-1 font-bold">Shop</th><th className="text-left py-1 font-bold">Phone</th><th className="text-right py-1 font-bold">Txns</th><th className="text-right py-1 font-bold">Sales</th><th className="text-center py-1 font-bold">Status</th></tr></thead>
              <tbody>{shops.shops.map(shop => (
                <tr key={shop.id} className="border-t" style={{ borderColor: '#f3f4f6' }}>
                  <td className="py-1.5 font-bold" style={{ color: '#111827' }}>{shop.name}</td>
                  <td className="py-1.5" style={{ color: '#6b7280' }}>{shop.ownerPhone}</td>
                  <td className="py-1.5 text-right" style={{ color: '#374151' }}>{shop.totalTransactions}</td>
                  <td className="py-1.5 text-right" style={{ color: '#374151' }}>{fmt(shop.totalSalesBirr)}</td>
                  <td className="py-1.5 text-center"><span className="px-2 py-0.5 rounded-full text-[9px] font-bold" style={{ background: shop.status === 'active' ? '#dcfce7' : shop.status === 'dormant' ? '#fef3c7' : '#f3f4f6', color: shop.status === 'active' ? '#166534' : shop.status === 'dormant' ? '#92400e' : '#6b7280' }}>{shop.status}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      )}

      {tab === 'features' && features && (<>
        <Section title="Feature Adoption">
          <StatRow label="Using Credit" value={`${features.features.shopsUsingCredit}/${d.platformNumbers.shops}`} />
          <StatRow label="Using Suppliers" value={`${features.features.shopsUsingSuppliers}/${d.platformNumbers.shops}`} />
          <StatRow label="Using Telegram" value={`${features.features.shopsUsingTelegram}/${d.platformNumbers.shops}`} />
        </Section>
        <Section title="Payment Methods">
          {Object.entries(features.paymentMethods).sort((a, b) => b[1] - a[1]).map(([method, count]) => (
            <div key={method}><div className="flex justify-between items-center py-1"><span className="text-xs font-bold" style={{ color: '#374151' }}>{method}</span><span className="text-xs font-black" style={{ color: '#111827' }}>{count}</span></div><Bar value={count} max={Math.max(...Object.values(features.paymentMethods))} /></div>
          ))}
        </Section>
      </>)}

      {tab === 'actions' && (<>
        <Section title="Refresh Data">
          <button onClick={loadData} className="w-full py-2.5 rounded-xl text-xs font-bold text-white min-h-[44px]" style={{ background: '#1B4332' }}>Refresh Dashboard</button>
        </Section>

        <Section title="Broadcast Notification" subtitle="Send in-app notification to all shops">
          <div className="space-y-3">
            <input type="text" value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none" style={{ borderColor: '#e8e2d8' }} />
            <textarea value={broadcastBody} onChange={e => setBroadcastBody(e.target.value)} placeholder="Message body" rows={3} className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none resize-none" style={{ borderColor: '#e8e2d8' }} />
            {broadcastResult && <div className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: broadcastResult.ok ? '#dcfce7' : '#fee2e2', color: broadcastResult.ok ? '#166534' : '#991b1b' }}>{broadcastResult.ok ? `Sent to ${broadcastResult.sent}/${broadcastResult.total} shops` : `Failed: ${broadcastResult.error}`}</div>}
            <button onClick={async () => {
              if (!broadcastTitle || !broadcastBody) return;
              setBroadcastSending(true); setBroadcastResult(null);
              const token = await getAuthToken();
              try {
                const res = await fetch(`${API_BASE}/admin/broadcast`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ title: broadcastTitle, body: broadcastBody, type: 'announcement' }) });
                const result = await res.json(); setBroadcastResult(result);
                if (result.ok) { setBroadcastTitle(''); setBroadcastBody(''); }
              } catch (err) { setBroadcastResult({ ok: false, error: err.message }); }
              setBroadcastSending(false);
            }} disabled={broadcastSending || !broadcastTitle || !broadcastBody} className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]" style={{ background: broadcastSending || !broadcastTitle || !broadcastBody ? '#e5e7eb' : '#C4883A', color: broadcastSending || !broadcastTitle || !broadcastBody ? '#9ca3af' : '#fff' }}>
              {broadcastSending ? '...' : 'Send to All Shops'}
            </button>
          </div>
        </Section>

        <Section title="Push Notification" subtitle="Send browser push to all subscribed devices">
          <div className="space-y-3">
            <input type="text" value={pushTitle} onChange={e => setPushTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none" style={{ borderColor: '#e8e2d8' }} />
            <textarea value={pushBody} onChange={e => setPushBody(e.target.value)} placeholder="Message body" rows={2} className="w-full px-3 py-2.5 rounded-xl text-xs border-2 focus:outline-none resize-none" style={{ borderColor: '#e8e2d8' }} />
            {pushResult && <div className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: pushResult.ok ? '#dcfce7' : '#fee2e2', color: pushResult.ok ? '#166534' : '#991b1b' }}>{pushResult.ok ? `Pushed: ${pushResult.sent}/${pushResult.total} (${pushResult.failed} failed)` : `Failed: ${pushResult.error}`}</div>}
            <button onClick={async () => {
              if (!pushTitle || !pushBody) return;
              setPushSending(true); setPushResult(null);
              const token = await getAuthToken();
              try {
                const res = await fetch(`${API_BASE}/admin/push-all`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ title: pushTitle, body: pushBody }) });
                const result = await res.json(); setPushResult(result);
                if (result.ok) { setPushTitle(''); setPushBody(''); }
              } catch (err) { setPushResult({ ok: false, error: err.message }); }
              setPushSending(false);
            }} disabled={pushSending || !pushTitle || !pushBody} className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px]" style={{ background: pushSending || !pushTitle || !pushBody ? '#e5e7eb' : '#1d4ed8', color: pushSending || !pushTitle || !pushBody ? '#9ca3af' : '#fff' }}>
              {pushSending ? '...' : 'Send Push Notification'}
            </button>
          </div>
        </Section>

        <Section title="Export Shop List" subtitle="Download CSV of all shops">
          <button onClick={async () => {
            const token = await getAuthToken();
            const res = await fetch(`${API_BASE}/admin/export-shops`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
            const blob = await res.blob(); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `gebya-shops-${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
          }} className="w-full py-2.5 rounded-xl text-xs font-bold text-white min-h-[44px]" style={{ background: '#374151' }}>Download CSV</button>
        </Section>
      </>)}

      <p className="text-center text-[9px]" style={{ color: '#9ca3af' }}>Generated {new Date(d.generatedAt).toLocaleString()}</p>
    </div>
  );
}

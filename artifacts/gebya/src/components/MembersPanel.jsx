import { useState, useEffect } from 'react';
import { useLang } from '../context/LangContext';
import { listAdminMembers, addAdminMember, removeAdminMember } from '../api/admin.js';
import { label } from '../labels/index.js';

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MembersPanel() {
  const { lang } = useLang();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const load = async () => {
    setError(null);
    try {
      const res = await listAdminMembers();
      setMembers(res.members || []);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!phone.trim() && !email.trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await addAdminMember({ phone: phone.trim() || null, email: email.trim() || null, note: note.trim() || null });
      setFeedback(
        res.status === 'added'
          ? (label('staff.member-added', lang))
          : (label('staff.already-on-the-list', lang))
      );
      setPhone('');
      setNote('');
      await load();
    } catch (e) {
      setFeedback((label('staff.error', lang)) + e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id, ph) => {
    if (!window.confirm(label('staff.remove-from-platform-admins', lang, ph))) return;
    try {
      await removeAdminMember(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--color-border)' }}>
        <p className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>
          {label('staff.add-team-member', lang)}
        </p>
        <p className="text-[10px] mb-2" style={{ color: 'var(--color-text-soft)' }}>
          {label('staff.ethiopian-mobile-09-2519-or-email-google', lang)}
        </p>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="+251912345678"
          className="w-full px-3 py-2.5 rounded-xl text-sm mb-2"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          inputMode="email"
          placeholder="admin@company.com"
          className="w-full px-3 py-2.5 rounded-xl text-sm mb-2"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={label('staff.note-optional', lang)}
          className="w-full px-3 py-2.5 rounded-xl text-sm mb-2"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
        />
        <button
          onClick={handleAdd}
          disabled={busy || (!phone.trim() && !email.trim())}
          className="w-full py-2.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {busy ? '...' : (label('staff.add-member', lang))}
        </button>
        {feedback && (
          <p className="text-[11px] mt-2 font-bold" style={{ color: feedback.startsWith('Error') || feedback.startsWith('ስህተት') ? 'var(--color-danger-text)' : 'var(--color-success-text)' }}>
            {feedback}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--color-border)' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
          <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
            {label('staff.team-members', lang)}
          </p>
        </div>
        {members === null ? (
          <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
        ) : error ? (
          <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--color-danger-text)' }}>{error}</div>
        ) : members.length === 0 ? (
          <div className="px-4 py-6 text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
            {label('staff.no-members-yet', lang)}
          </div>
        ) : (
          <div>
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--color-border-light)' }}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text)' }}>{m.email || m.phone}</p>
                    <p className="text-[10px] truncate" style={{ color: 'var(--color-text-soft)' }}>
                      {m.note ? `${m.note} · ` : ''}{label('staff.added', lang)} {fmtDate(m.createdAt)}
                    </p>
                  </div>
                <button
                  onClick={() => handleRemove(m.id, m.email || m.phone)}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--color-danger-text)', background: 'var(--color-danger-bg)' }}
                >
                  {label('staff.remove', lang)}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
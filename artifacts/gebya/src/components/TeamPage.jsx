import { useCallback, useEffect, useState } from 'react';
import { Users, Copy, Check, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { useLang } from '../context/LangContext';
import { useShopStore } from '../stores/shopStore';
import { usePermissionsStore } from '../stores/permissionsStore';
import { fireToast } from './Toast';
import { getAuthToken } from '../utils/syncEngine';

const API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';

async function apiFetch(path, options = {}) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const ROLE_BADGE = {
  owner: { label: 'Owner', bg: '#fef3c7', color: '#92400e' },
  cashier: { label: 'Cashier', bg: '#f3f4f6', color: '#4b5563' },
  viewer: { label: 'Viewer', bg: '#f3f4f6', color: '#4b5563' },
};

function RoleBadge({ role }) {
  const style = ROLE_BADGE[role] || ROLE_BADGE.viewer;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: style.bg, color: style.color }}>
      {style.label}
    </span>
  );
}

function ActorSelector({ staffMembers, activeStaffMemberId, currentActorLabel, onSetActiveStaffMember, shopProfile, lang }) {
  return (
    <div className="rounded-xl border px-4 py-3" style={{ borderColor: '#e8e2d8', background: '#fcfbf8' }}>
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
        {lang === 'am' ? 'አሁን ሪኮርድ እያደረጉ ያሉ' : 'Recording as'}
      </div>
      <div className="text-sm font-black text-gray-900 mb-2">{currentActorLabel || 'Owner'}</div>
      <label className="block text-xs font-bold text-gray-500 mb-1.5">
        {lang === 'am' ? 'አዲስ ሪኮርዶችን እንደ ያስቀምጡ' : 'Save new records as'}
      </label>
      <select
        value={activeStaffMemberId || ''}
        onChange={(e) => onSetActiveStaffMember?.(e.target.value || null)}
        className="w-full px-4 py-3 border-2 rounded-xl text-sm focus:outline-none bg-white"
        style={{ borderColor: '#e8e2d8' }}
      >
        <option value="">Owner ({shopProfile?.name || 'Owner'})</option>
        {(staffMembers || []).filter(m => m.active !== false).map(m => (
          <option key={m.id} value={m.id}>{m.display_name}</option>
        ))}
      </select>
    </div>
  );
}

const PERMISSION_LABELS = {
  en: {
    can_add_records: 'Can add records',
    can_delete_records: 'Can delete records',
    can_edit_settings: 'Can see settings',
    can_manage_team: 'Can manage team',
    can_view_reports: 'Can view reports',
  },
  am: {
    can_add_records: 'ሪኮርድ ማስገባት ይችላል',
    can_delete_records: 'ሪኮርድ መሰረዝ ይችላል',
    can_edit_settings: 'ማቀረፃዎችን ማየት ይችላል',
    can_manage_team: 'ቡድን ማስተዳደር ይችላል',
    can_view_reports: 'ሪፖርት ማየት ይችላል',
  },
};

function PermissionToggle({ keyName, value, onChange, lang }) {
  const label = PERMISSION_LABELS[lang]?.[keyName] || keyName;
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs font-bold text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(keyName, !value)}
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
        style={{ background: value ? '#1B4332' : '#e5e7eb' }}
      >
        <span
          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(14px)' : 'translateX(2px)' }}
        />
      </button>
    </div>
  );
}

function MemberPermissionPanel({ member, onUpdatePermission, lang }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const perms = member.resolved_permissions || {};

  const handleToggle = async (key, nextValue) => {
    if (saving) return;
    setSaving(true);
    try {
      await apiFetch(`/business/members/${member.userId}/permissions`, {
        method: 'PATCH',
        body: JSON.stringify({ [key]: nextValue }),
      });
      // Optimistically update local state
      if (member.resolved_permissions) {
        member.resolved_permissions[key] = nextValue;
      }
      fireToast(lang === 'am' ? '✓ ተሻሽሏል' : '✓ Updated', 1500);
    } catch (err) {
      fireToast(err.message || (lang === 'am' ? 'አልተሳካም' : 'Failed'), 2400);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b last:border-0" style={{ borderColor: '#f0ece4' }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
        style={{ background: member.active ? '#fff' : '#f9fafb' }}
      >
        <div>
          <div className="text-sm font-bold text-gray-900">{member.phoneNumber || 'Staff member'}</div>
          <div className="text-xs text-gray-500">
            {member.joined_at || member.joinedAt ? new Date(member.joined_at || member.joinedAt).toLocaleDateString() : (lang === 'am' ? 'ያልተቀላቀለ' : 'Not joined yet')}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RoleBadge role={member.role} />
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5`} style={{ background: member.active ? '#ecfdf5' : '#f3f4f6', color: member.active ? '#166534' : '#6b7280' }}>
            {member.active ? (lang === 'am' ? 'ንቁ' : 'Active') : (lang === 'am' ? 'ተሰናብቷል' : 'Inactive')}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-1" style={{ background: '#fafaf9' }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              {lang === 'am' ? 'ፍቃዶች' : 'Permissions'}
            </span>
          </div>
          {Object.entries(perms).map(([key, value]) => (
            <PermissionToggle
              key={key}
              keyName={key}
              value={value}
              onChange={handleToggle}
              lang={lang}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamPage({
  staffMembers,
  activeStaffMemberId,
  currentActorLabel,
  onSetActiveStaffMember,
  onSaveStaffMember,
  onUpdateStaffMember,
  onDeactivateStaffMember,
  onReactivateStaffMember,
}) {
  const { lang } = useLang();
  const shopProfile = useShopStore(s => s.shopProfile);
  const canManageTeam = usePermissionsStore(s => s.hasPermission('can_manage_team'));

  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('cashier');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [copied, setCopied] = useState(false);

  const [cloudMembers, setCloudMembers] = useState(null);
  const [membersLoading, setMembersLoading] = useState(false);

  const [staffName, setStaffName] = useState('');

  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const data = await apiFetch('/business/members');
      setCloudMembers(data.members || []);
    } catch {
      setCloudMembers(null);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleInvite = async () => {
    if (!phone.trim()) return;
    setInviting(true);
    try {
      const data = await apiFetch('/business/invite', {
        method: 'POST',
        body: JSON.stringify({ phone_number: phone.trim(), role }),
      });
      setInviteLink(data.invite_link);
      setPhone('');
      fireToast(lang === 'am' ? '✓ ጥሪ ተፈጠረ' : '✓ Invite created', 2000);
      loadMembers();
    } catch (err) {
      fireToast(err.message || (lang === 'am' ? 'አልተሳካም' : 'Failed'), 2400);
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleAddLocalStaff = async () => {
    if (!staffName.trim()) return;
    await onSaveStaffMember?.({ display_name: staffName.trim(), role: 'staff', active: true });
    setStaffName('');
  };

  return (
    <div className="space-y-4 pb-4">
      <ActorSelector
        staffMembers={staffMembers}
        activeStaffMemberId={activeStaffMemberId}
        currentActorLabel={currentActorLabel}
        onSetActiveStaffMember={onSetActiveStaffMember}
        shopProfile={shopProfile}
        lang={lang}
      />

      {/* Invite section — only visible to owners */}
      {canManageTeam && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e2d8', background: '#fff' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: '#f0ece4', background: '#fcfbf8' }}>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-black text-gray-900">
                {lang === 'am' ? 'ሰራተኛ ጋብዝ' : 'Invite staff'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {lang === 'am'
                ? 'ሰራተኛ ቴሌፎን ቁጥር ያስገቡ — ለራሳቸው ስልክ ሊጠቀሙ ይችላሉ'
                : 'Staff get their own phone login and see the full shop notebook'}
            </p>
          </div>

          <form className="px-4 py-3 space-y-3" onSubmit={(e) => { e.preventDefault(); handleInvite(); }}>
            <div className="flex gap-2">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder={lang === 'am' ? 'ቴሌፎን ቁጥር' : 'Phone number'}
                className="flex-1 px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none"
                style={{ borderColor: phone.trim() ? '#C4883A' : '#e8e2d8' }}
              />
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none bg-white"
                style={{ borderColor: '#e8e2d8' }}
              >
                <option value="cashier">{lang === 'am' ? 'ካሸር' : 'Cashier'}</option>
                <option value="viewer">{lang === 'am' ? 'ተመልካች' : 'Viewer'}</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={!phone.trim() || inviting}
              className="w-full py-2.5 rounded-xl text-sm font-bold min-h-[44px]"
              style={{ background: phone.trim() ? '#1B4332' : '#e5e7eb', color: phone.trim() ? '#fff' : '#9ca3af' }}
            >
              {inviting ? '...' : (lang === 'am' ? 'ጥሪ ፍጠር' : 'Invite')}
            </button>

            {inviteLink && (
              <div className="rounded-xl border px-3 py-2.5 space-y-2" style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
                <p className="text-xs font-bold text-green-800">{lang === 'am' ? 'ጥሪ ሊንክ' : 'Invite link — share this'}</p>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-xs font-mono text-gray-600 truncate">{inviteLink}</span>
                  <button type="button" onClick={handleCopyLink} className="flex-shrink-0 px-2 py-1.5 rounded-lg press-scale text-xs font-bold" style={{ background: copied ? '#dcfce7' : '#e8e2d8', color: copied ? '#166534' : '#374151' }} aria-label="Copy">
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400">Coming soon: send via Telegram automatically</p>
              </div>
            )}
          </form>
        </div>
      )}

      {/* Team members list — visible to everyone, but permission editing only for owners */}
      {cloudMembers !== null && (
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e2d8' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: '#f0ece4', background: '#fcfbf8' }}>
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {lang === 'am' ? 'የቡድን አባላት' : 'Team members'}
            </span>
            {membersLoading && <span className="text-xs text-gray-400">...</span>}
          </div>
          {cloudMembers.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400">
              {lang === 'am' ? 'እስካሁን አባላት የሉም' : 'No members yet'}
            </div>
          ) : (
            cloudMembers.map(m => (
              <MemberPermissionPanel
                key={m.id}
                member={m}
                onUpdatePermission={() => loadMembers()}
                lang={lang}
              />
            ))
          )}
        </div>
      )}

      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: '#e8e2d8' }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: '#f0ece4', background: '#fcfbf8' }}>
          <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
            {lang === 'am' ? 'የዚህ ስልክ ሰራተኞች (Attribution)' : 'This-phone staff labels'}
          </span>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {lang === 'am' ? 'ሁሉም ስልኩን ቢጋሩ ለሪኮርዶች ስም ለመስጠት' : 'For shops where multiple people share one phone'}
          </p>
        </div>
        <div className="px-4 py-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={staffName}
              onChange={e => setStaffName(e.target.value)}
              placeholder={lang === 'am' ? 'የሰራተኛ ስም' : 'Staff name'}
              className="flex-1 px-3 py-2.5 border-2 rounded-xl text-sm focus:outline-none"
              style={{ borderColor: staffName.trim() ? '#C4883A' : '#e8e2d8' }}
              onKeyDown={e => e.key === 'Enter' && handleAddLocalStaff()}
            />
            <button
              type="button"
              onClick={handleAddLocalStaff}
              disabled={!staffName.trim()}
              className="px-4 py-2.5 rounded-xl text-sm font-bold min-h-[44px]"
              style={{ background: staffName.trim() ? '#1B4332' : '#e5e7eb', color: staffName.trim() ? '#fff' : '#9ca3af' }}
            >
              {lang === 'am' ? 'ጨምር' : 'Add'}
            </button>
          </div>
          {(staffMembers || []).map(member => (
            <div key={member.id} className="flex items-center justify-between px-3 py-2 rounded-xl border" style={{ borderColor: '#e8e2d8', background: member.active === false ? '#f9fafb' : '#fff' }}>
              <div>
                <span className="text-sm font-bold text-gray-900">{member.display_name}</span>
                <span className="ml-2 text-xs text-gray-400">{member.active === false ? (lang === 'am' ? 'ተሰናብቷል' : 'Inactive') : (member.role || 'staff')}</span>
              </div>
              <button
                type="button"
                onClick={() => member.active === false ? onReactivateStaffMember?.(member.id) : onDeactivateStaffMember?.(member.id)}
                className="text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                style={{ background: '#f5f5f5', color: '#6b7280' }}
              >
                {member.active === false ? (lang === 'am' ? 'ንቁ አድርግ' : 'Reactivate') : (lang === 'am' ? 'አቁም' : 'Deactivate')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

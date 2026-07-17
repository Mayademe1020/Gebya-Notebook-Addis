import { useState } from 'react';
import TeamPage from '../../TeamPage';
import { useLang } from '../../../context/LangContext';

function StaffActivityFeed() {
  const { lang } = useLang();

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {['all', 'sale', 'customer_payment', 'customer_credit'].map(f => (
          <button
            key={f}
            className="px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap"
            style={{ background: '#f3f4f6', color: '#6b7280' }}
          >
            {f === 'all' ? (lang === 'am' ? 'ሁሉም' : 'All') :
             f === 'sale' ? (lang === 'am' ? 'ሽያጭ' : 'Sales') :
             f === 'customer_payment' ? (lang === 'am' ? 'ክፍያ' : 'Payments') :
             (lang === 'am' ? 'ዱቤ' : 'Dubie')}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-400 text-center py-6">
        {lang === 'am' ? 'የሰራተኞች እንቅስቃሴ እዚህ ይታያል' : 'Staff activity will appear here as team members record sales, payments, and Dubie.'}
      </p>
    </div>
  );
}

export default function StaffTab(props) {
  const {
    staffMembers,
    activeStaffMemberId,
    currentActorLabel,
    onSetActiveStaffMember,
    onSaveStaffMember,
    onUpdateStaffMember,
    onDeactivateStaffMember,
    onReactivateStaffMember,
    onApproveDevice,
    onRejectDevice,
    lang,
  } = props;

  const [activityOpen, setActivityOpen] = useState(false);
  const [deviceOpen, setDeviceOpen] = useState(false);
  const activeCount = (staffMembers || []).filter(m => m.active !== false).length;

  return (
    <div>
      <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden mb-2.5">
        <TeamPage
          staffMembers={staffMembers}
          activeStaffMemberId={activeStaffMemberId}
          currentActorLabel={currentActorLabel}
          onSetActiveStaffMember={onSetActiveStaffMember}
          onSaveStaffMember={onSaveStaffMember}
          onUpdateStaffMember={onUpdateStaffMember}
          onDeactivateStaffMember={onDeactivateStaffMember}
          onReactivateStaffMember={onReactivateStaffMember}
        />
      </div>

      <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden mb-2.5">
        <button
          type="button"
          onClick={() => setActivityOpen(!activityOpen)}
          className="w-full text-left px-4 py-3.5 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" style={{ background: '#fafaf5' }}>
            📋
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-gray-900 truncate">
              {lang === 'am' ? 'የሰራተኞች እንቅስቃሴ' : 'Staff Activity'}
            </div>
            <div className="text-[11px] mt-0.5 truncate" style={{ color: '#9ca3af' }}>
              {lang === 'am' ? `${activeCount} ንቁ ሰራተኞች` : `${activeCount} active staff`}
            </div>
          </div>
          <span style={{ color: '#9ca3af', fontSize: '1.1rem', flexShrink: 0, transition: 'transform 0.2s', transform: activityOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ›
          </span>
        </button>
        {activityOpen && <StaffActivityFeed />}
      </div>

      <div className="bg-white rounded-2xl border border-green-100/50 overflow-hidden mb-2.5">
        <button
          type="button"
          onClick={() => setDeviceOpen(!deviceOpen)}
          className="w-full text-left px-4 py-3.5 flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base" style={{ background: '#fafaf5' }}>
            📱
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-gray-900 truncate">
              {lang === 'am' ? 'የመሳሪያ አስተዳደር' : 'Device Management'}
            </div>
            <div className="text-[11px] mt-0.5 truncate" style={{ color: '#9ca3af' }}>
              {lang === 'am' ? 'የተፈቀዱ መሳሪዎችን ያስተዳድሩ' : 'Manage approved devices'}
            </div>
          </div>
          <span style={{ color: '#9ca3af', fontSize: '1.1rem', flexShrink: 0, transition: 'transform 0.2s', transform: deviceOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ›
          </span>
        </button>
        {deviceOpen && (
          <div className="px-4 pb-4 text-sm text-gray-500">
            {lang === 'am' ? 'የመሳሪያ አስተዳደር እዚህ ይታያል' : 'Device management will appear here.'}
          </div>
        )}
      </div>
    </div>
  );
}

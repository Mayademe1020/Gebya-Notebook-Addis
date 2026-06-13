export function normalizeStaffDraft(payload = {}) {
  const displayName = String(payload.display_name || '').trim();
  if (!displayName) return null;

  const role = payload.role === 'owner' ? 'owner' : 'staff';
  const now = Date.now();

  return {
    display_name: displayName,
    role,
    active: payload.active !== false,
    created_at: payload.created_at || now,
    updated_at: now,
    deactivated_at: payload.active === false ? (payload.deactivated_at || now) : null,
  };
}

export function resolveActorSnapshot({ shopProfile, staffMembers = [], activeStaffMemberId = null }) {
  const activeStaff = staffMembers.find((member) => (
    String(member.id) === String(activeStaffMemberId) && member.active !== false
  ));

  if (activeStaff) {
    return {
      actor_role: activeStaff.role || 'staff',
      actor_staff_member_id: activeStaff.id,
      actor_name_snapshot: activeStaff.display_name || 'Staff',
    };
  }

  const ownerName = String(shopProfile?.name || '').trim();
  return {
    actor_role: 'owner',
    actor_staff_member_id: shopProfile?.staff_id || null,
    actor_name_snapshot: ownerName || 'Owner',
  };
}

export function getActorDisplayLabel({ shopProfile, staffMembers = [], activeStaffMemberId = null }) {
  const snapshot = resolveActorSnapshot({ shopProfile, staffMembers, activeStaffMemberId });
  return snapshot.actor_name_snapshot;
}

import { useState, useEffect, useCallback } from 'react';
import db from '../db';
import { normalizeStaffDraft } from '../utils/staffMembers';

/**
 * useStaff hook — handles staff member CRUD, active selection, deactivation.
 * Keeps state in sync with IndexedDB.
 */

export function useStaff() {
  const [staffMembers, setStaffMembers] = useState([]);
  const [activeStaffMemberId, setActiveStaffMemberId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rows, setting] = await Promise.all([
          db.staff_members.toArray(),
          db.settings.get('active_staff_member_id'),
        ]);
        if (!cancelled) {
          setStaffMembers((rows || []).sort((a, b) => {
            if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
            return String(a.display_name || '').localeCompare(String(b.display_name || ''));
          }));
          const requestedId = setting?.value ?? null;
          const hasActive = (rows || []).some(m => String(m.id) === String(requestedId) && m.active !== false);
          setActiveStaffMemberId(hasActive ? requestedId : null);
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('useStaff load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const add = useCallback(async (displayName) => {
    const draft = normalizeStaffDraft({ display_name: displayName });
    const now = Date.now();
    const toSave = {
      ...draft,
      created_at: now,
      updated_at: now,
      active: true,
      role: 'staff',
    };
    const id = await db.staff_members.add(toSave);
    const saved = await db.staff_members.get(id);
    setStaffMembers(prev => [...prev, saved].sort((a, b) => {
      if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
      return String(a.display_name || '').localeCompare(String(b.display_name || ''));
    }));
    return saved;
  }, []);

  const update = useCallback(async (staffId, payload) => {
    const member = staffMembers.find(item => String(item.id) === String(staffId));
    if (!member) return false;
    const displayName = String(payload?.display_name || '').trim();
    if (!displayName) return false;
    const now = Date.now();
    await db.staff_members.update(member.id, { display_name: displayName, updated_at: now });
    const updatedMember = { ...member, display_name: displayName, updated_at: now };
    setStaffMembers(prev => prev
      .map(item => item.id === member.id ? updatedMember : item)
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
    return updatedMember;
  }, [staffMembers]);

  const setActive = useCallback(async (staffId) => {
    const nextId = staffId ? Number(staffId) : null;
    await db.settings.put({ key: 'active_staff_member_id', value: nextId });
    setActiveStaffMemberId(nextId);
  }, []);

  const deactivate = useCallback(async (staffId) => {
    const member = staffMembers.find(item => String(item.id) === String(staffId));
    if (!member) return false;
    const now = Date.now();
    await db.staff_members.update(member.id, { active: false, updated_at: now, deactivated_at: now });
    setStaffMembers(prev => prev
      .map(item => item.id === member.id ? { ...item, active: false, updated_at: now, deactivated_at: now } : item)
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
    if (String(activeStaffMemberId) === String(member.id)) {
      await db.settings.put({ key: 'active_staff_member_id', value: null });
      setActiveStaffMemberId(null);
    }
    return true;
  }, [staffMembers, activeStaffMemberId]);

  const reactivate = useCallback(async (staffId) => {
    const member = staffMembers.find(item => String(item.id) === String(staffId));
    if (!member) return false;
    const now = Date.now();
    await db.staff_members.update(member.id, { active: true, updated_at: now, deactivated_at: null });
    setStaffMembers(prev => prev
      .map(item => item.id === member.id ? { ...item, active: true, updated_at: now, deactivated_at: null } : item)
      .sort((a, b) => {
        if ((a.active !== false) !== (b.active !== false)) return a.active === false ? 1 : -1;
        return String(a.display_name || '').localeCompare(String(b.display_name || ''));
      }));
    return true;
  }, [staffMembers]);

  return {
    staffMembers,
    activeStaffMemberId,
    loading,
    add,
    update,
    setActive,
    deactivate,
    reactivate,
  };
}

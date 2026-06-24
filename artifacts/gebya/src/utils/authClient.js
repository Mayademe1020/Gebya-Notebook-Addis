const AUTH_API_BASE = import.meta.env.VITE_SYNC_API_URL || '/api';

// ─── Request OTP ───
export async function requestOtp(phoneNumber) {
  const res = await fetch(`${AUTH_API_BASE}/auth/otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
  return data;
}

// ─── Verify OTP ───
export async function verifyOtp(phoneNumber, otp) {
  const res = await fetch(`${AUTH_API_BASE}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, otp: String(otp).trim() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid OTP');
  return data; // { token, user }
}

// ─── Link device ───
export async function linkDevice(token, deviceId, deviceName) {
  const res = await fetch(`${AUTH_API_BASE}/auth/link-device`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ device_id: deviceId, device_name: deviceName || null }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to link device');
  return data;
}

// ─── Get current user ───
export async function getCurrentUser(token) {
  const res = await fetch(`${AUTH_API_BASE}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to get user');
  return data; // { ok, user, role, permissions }
}

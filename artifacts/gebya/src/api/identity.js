// API client for PR 1A identity endpoints.
// Uses the existing PR 1A backend routes under /api.
// The base URL is configured via Vite env variable VITE_API_BASE (defaults to /api for same-origin).

const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '');

async function request(path, options = {}) {
  const url = `${BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  // Add bearer token from local identity cache if available
  const token = options.token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const identityApi = {
  // POST /api/shops - owner creates a shop
  async createShop({ display_name, phone, business_type, phone_required, approval_required }) {
    return request('/shops', {
      method: 'POST',
      body: JSON.stringify({ display_name, phone, business_type, phone_required, approval_required }),
    });
  },

  // POST /api/shops/join - staff joins a shop
  async joinShop({ join_code, display_name, phone, device_label, device_id }) {
    return request('/shops/join', {
      method: 'POST',
      body: JSON.stringify({ join_code, display_name, phone, device_label, device_id }),
    });
  },

  // GET /api/me - current device + identity
  async getMe(token) {
    return request('/me', { token });
  },

  // GET /api/shops/:shop_id/staff - owner lists staff
  async listStaff(shopId, token) {
    return request(`/shops/${shopId}/staff`, { token });
  },

  // POST /api/shops/:shop_id/rotate-code - owner rotates join code
  async rotateJoinCode(shopId, token) {
    return request(`/shops/${shopId}/rotate-code`, { method: 'POST', token });
  },

  // POST /api/shops/:shop_id/settings - owner updates settings
  async updateShopSettings(shopId, { phone_required, approval_required }, token) {
    return request(`/shops/${shopId}/settings`, {
      method: 'POST',
      token,
      body: JSON.stringify({ phone_required, approval_required }),
    });
  },

  // POST /api/staff/:staff_id/permissions - owner toggles can_create_customer_credit
  async updateStaffPermissions(staffId, { can_create_customer_credit }, token) {
    return request(`/staff/${staffId}/permissions`, {
      method: 'POST',
      token,
      body: JSON.stringify({ can_create_customer_credit }),
    });
  },

  // POST /api/staff/:staff_id/deactivate - owner deactivates staff
  async deactivateStaff(staffId, token) {
    return request(`/staff/${staffId}/deactivate`, { method: 'POST', token });
  },

  // POST /api/devices/:device_id/approve - owner approves device
  async approveDevice(deviceId, token) {
    return request(`/devices/${deviceId}/approve`, { method: 'POST', token });
  },

  // POST /api/devices/:device_id/reject - owner rejects device
  async rejectDevice(deviceId, { reason }, token) {
    return request(`/devices/${deviceId}/reject`, {
      method: 'POST',
      token,
      body: JSON.stringify({ reason }),
    });
  },

  // POST /api/devices/:device_id/revoke - owner revokes device
  async revokeDevice(deviceId, { reason }, token) {
    return request(`/devices/${deviceId}/revoke`, {
      method: 'POST',
      token,
      body: JSON.stringify({ reason }),
    });
  },
};

export default identityApi;
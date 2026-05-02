const BASE = (import.meta.env.VITE_API_URL || `https://safepath-yzcu.onrender.com`).replace(/\/$/, '') + '/api';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'error' in json
        ? String((json as Record<string, unknown>).error)
        : 'Request failed';
    throw new Error(msg);
  }
  return json as T;
}

// ─── Shared interfaces ────────────────────────────────────────────────────────

export interface RoomStatus {
  room_number: number;
  floor: number;
  status: 'available' | 'occupied';
  guest_name?: string;
  language?: string;
  checkin_datetime?: string;
}

export interface GuestRecord {
  id: string;
  guest_name: string;
  room_number: number;
  floor: number;
  language: string;
  email: string;
  mobile: string;
  checkin_datetime: string;
  checkout_datetime?: string;
  qr_token: string;
  status: 'active' | 'checked_out';
}

export interface RegisterGuestPayload {
  name: string;
  roomNumber: number;
  language: string;
  email: string;
  mobile: string;
  guestsCount: number;
}

export interface RegisterGuestResponse {
  success: boolean;
  token: string;
  guest: {
    guest_name: string;
    room_number: number;
    floor: number;
    language: string;
    email: string;
    mobile: string;
    checkin_datetime: string;
  };
}

export interface GuestByTokenResponse {
  id: string;
  guest_name: string;
  room_number: number;
  floor: number;
  language: string;
  email: string;
  mobile: string;
  checkin_datetime: string;
  qr_token: string;
}

export interface FloorStats {
  floor: number;
  total: number;
  occupied: number;
}

export interface StatsResponse {
  total: number;
  occupied: number;
  available: number;
  byFloor: FloorStats[];
}

export interface ApiAlert {
  id: string;
  guest_name: string;
  room_number: number;
  floor: number;
  severity: number;
  message: string;
  timestamp: string;
  status: 'active' | 'acknowledged';
}

export interface ApiBroadcast {
  id: string;
  target: string;
  message: string;
  timestamp: string;
}

export interface ApiStaff {
  staff_id: string;
  name: string;
  role: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const api = {
  getRooms: () =>
    apiFetch<RoomStatus[]>('/rooms'),

  /** Staff registers a guest — returns unique QR token */
  registerGuest: (payload: RegisterGuestPayload) =>
    apiFetch<RegisterGuestResponse>('/register-guest', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  /** Guest verifies their QR code token */
  getGuestByToken: (token: string) =>
    apiFetch<GuestByTokenResponse>(`/guest-by-token/${encodeURIComponent(token)}`),

  /** Staff checks out a guest */
  checkout: (roomNumber: number) =>
    apiFetch<{ success: boolean; message: string }>('/checkout', {
      method: 'POST',
      body: JSON.stringify({ roomNumber }),
    }),

  getGuests: (status: 'active' | 'all' = 'active') =>
    apiFetch<GuestRecord[]>(`/guests?status=${status}`),

  clearGuestHistory: () =>
    apiFetch<{ success: boolean; count: number }>('/guests/history', { method: 'DELETE' }),

  getStats: () =>
    apiFetch<StatsResponse>('/stats'),

  getAlerts: () =>
    apiFetch<ApiAlert[]>('/alerts'),

  createAlert: (payload: { guestName: string; roomNumber: number; floor: number; severity: number; message: string; category?: string }) =>
    apiFetch<{ success: boolean; id: string }>('/alerts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  acknowledgeAlert: (id: string) =>
    apiFetch<{ success: boolean }>(`/alerts/${id}`, { 
      method: 'PATCH',
      body: JSON.stringify({ status: 'acknowledged' })
    }),

  clearResolvedAlerts: () =>
    apiFetch<{ success: boolean; count: number }>('/alerts/resolved', { method: 'DELETE' }),

  updateAlert: (id: string, payload: { severity?: number; status?: string }) =>
    apiFetch<{ success: boolean }>(`/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),

  resolveAlertsByRoom: (roomNumber: number) =>
    apiFetch<{ success: boolean }>('/alerts/resolve-by-room', {
      method: 'POST',
      body: JSON.stringify({ roomNumber })
    }),

  getBroadcasts: (language?: string) =>
    apiFetch<ApiBroadcast[]>(`/broadcasts${language ? `?language=${encodeURIComponent(language)}` : ''}`),

  createBroadcast: (payload: { target: string; message: string }) =>
    apiFetch<{ success: boolean }>('/broadcasts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteBroadcast: (id: string) =>
    apiFetch<{ success: boolean }>(`/broadcasts/${id}`, { method: 'DELETE' }),

  clearAllBroadcasts: () =>
    apiFetch<{ success: boolean }>('/broadcasts', { method: 'DELETE' }),

  clearTrials: () =>
    apiFetch<{ success: boolean; message: string }>('/clear-trials', { method: 'DELETE' }),

  // ─── Staff Management ───
  loginStaff: (staff_id: string, pin: string) =>
    apiFetch<{ success: boolean; staff: ApiStaff }>('/staff/login', {
      method: 'POST',
      body: JSON.stringify({ staff_id, pin }),
    }),

  getStaff: () =>
    apiFetch<ApiStaff[]>('/staff'),

  addStaff: (payload: { staff_id: string; name: string; pin: string; role?: string }) =>
    apiFetch<{ success: boolean; message: string }>('/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteStaff: (staff_id: string) =>
    apiFetch<{ success: boolean; message: string }>(`/staff/${encodeURIComponent(staff_id)}`, { method: 'DELETE' }),


  resendEmail: (roomNumber: number) =>
    apiFetch<{ success: boolean; message: string }>('/resend-email', {
      method: 'POST',
      body: JSON.stringify({ roomNumber }),
    }),

  // ─── Danger Zones ───
  getDangerZones: () =>
    apiFetch<{ room_id: string; level: string }[]>('/danger-zones'),

  upsertDangerZone: (roomId: string, level: string) =>
    apiFetch<{ success: boolean }>('/danger-zones', {
      method: 'POST',
      body: JSON.stringify({ roomId, level }),
    }),

  deleteDangerZone: (roomId: string) =>
    apiFetch<{ success: boolean }>(`/danger-zones/${encodeURIComponent(roomId)}`, { method: 'DELETE' }),

  clearAllDangerZones: () =>
    apiFetch<{ success: boolean }>('/danger-zones', { method: 'DELETE' }),

  suggestBroadcast: (target: string) =>
    apiFetch<{ suggestion: string }>(`/ai/suggest-broadcast?target=${encodeURIComponent(target)}`),
};

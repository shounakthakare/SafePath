const BASE = `http://${window.location.hostname}:5000/api`;

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
  id: number;
  guest_name: string;
  room_number: number;
  floor: number;
  language: string;
  email: string;
  mobile: string;
  checkin_datetime: string;
  checkout_datetime?: string;
  status: 'active' | 'checked_out';
}

export interface RegisterGuestPayload {
  name: string;
  roomNumber: number;
  language: string;
  email: string;
  mobile: string;
}

export interface RegisterGuestResponse {
  success: boolean;
  token: string;
  guest: {
    name: string;
    roomNumber: number;
    floor: number;
    language: string;
    email: string;
    mobile: string;
    checkinDatetime: string;
  };
}

export interface GuestByTokenResponse {
  id: number;
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
  id: number;
  guest_name: string;
  room_number: number;
  floor: number;
  severity: number;
  message: string;
  timestamp: string;
  status: 'active' | 'acknowledged';
}

export interface ApiBroadcast {
  id: number;
  target: string;
  message: string;
  timestamp: string;
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

  getStats: () =>
    apiFetch<StatsResponse>('/stats'),

  getAlerts: () =>
    apiFetch<ApiAlert[]>('/alerts'),

  createAlert: (payload: { guestName: string; roomNumber: number; floor: number; severity: number; message: string }) =>
    apiFetch<{ success: boolean; id: number }>('/alerts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  acknowledgeAlert: (id: number) =>
    apiFetch<{ success: boolean }>(`/alerts/${id}/acknowledge`, { method: 'POST' }),

  getBroadcasts: () =>
    apiFetch<ApiBroadcast[]>('/broadcasts'),

  createBroadcast: (payload: { target: string; message: string }) =>
    apiFetch<{ success: boolean }>('/broadcasts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteBroadcast: (id: number) =>
    apiFetch<{ success: boolean }>(`/broadcasts/${id}`, { method: 'DELETE' }),

  clearAllBroadcasts: () =>
    apiFetch<{ success: boolean }>('/broadcasts', { method: 'DELETE' }),

  clearTrials: () =>
    apiFetch<{ success: boolean; message: string }>('/clear-trials', { method: 'DELETE' }),
};

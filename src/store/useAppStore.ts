import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GuestProfile, Alert, DangerZone, UserRole, BroadcastMessage } from '../types';
import { MOCK_ALERTS } from '../constants';

interface AppState {
  guestProfile: GuestProfile | null;
  setGuestProfile: (profile: GuestProfile) => void;

  alerts: Alert[];
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (id: string) => void;

  dangerZones: DangerZone[];
  toggleDangerZone: (roomId: string) => void;

  activeRole: UserRole | null;
  setActiveRole: (role: UserRole) => void;

  broadcastMessages: BroadcastMessage[];
  addBroadcast: (msg: BroadcastMessage) => void;

  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      guestProfile: null,
      setGuestProfile: (profile) => set({ guestProfile: profile }),

      alerts: MOCK_ALERTS,
      addAlert: (alert) => set((state) => ({ alerts: [alert, ...state.alerts] })),
      acknowledgeAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, status: 'acknowledged' as const } : a
          ),
        })),

      dangerZones: [],
      toggleDangerZone: (roomId) => {
        const zones = get().dangerZones;
        const existing = zones.find((z) => z.roomId === roomId);
        if (!existing) {
          set({ dangerZones: [...zones, { roomId, level: 'warning' as const }] });
        } else if (existing.level === 'warning') {
          set({
            dangerZones: zones.map((z) =>
              z.roomId === roomId ? { ...z, level: 'danger' as const } : z
            ),
          });
        } else {
          set({ dangerZones: zones.filter((z) => z.roomId !== roomId) });
        }
      },

      activeRole: null,
      setActiveRole: (role) => set({ activeRole: role }),

      broadcastMessages: [],
      addBroadcast: (msg) =>
        set((state) => ({
          broadcastMessages: [msg, ...state.broadcastMessages],
        })),

      logout: () => set({ guestProfile: null, activeRole: null }),
    }),
    {
      name: 'safepath-storage',
      partialize: (state) => ({
        guestProfile: state.guestProfile,
        dangerZones: state.dangerZones,
        activeRole: state.activeRole,
      }),
    }
  )
);

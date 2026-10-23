import { create } from 'zustand';

import type { MaintenanceDetails } from '@/contracts/mobile/shop/v1';

/**
 * What the store can say that reaches past the screen that asked. The API
 * client raises both; the root layout answers them.
 *
 * - "This version is too old" is said to a change only (426): reading goes on,
 *   so the app asks to update and does not close. `dismissUpdate` is "not now";
 *   the next change the store refuses asks again.
 * - "The store is closed for maintenance" is said to every request, and the root
 *   layout shows a screen in place of the app.
 */
type GateState = {
  updateRequired: boolean;
  maintenance: MaintenanceDetails | null;
  requireUpdate: () => void;
  dismissUpdate: () => void;
  setMaintenance: (details: MaintenanceDetails) => void;
  clearMaintenance: () => void;
};

export const useGate = create<GateState>((set) => ({
  updateRequired: false,
  maintenance: null,
  requireUpdate: () => set({ updateRequired: true }),
  dismissUpdate: () => set({ updateRequired: false }),
  setMaintenance: (details) => set({ maintenance: details }),
  clearMaintenance: () => set({ maintenance: null }),
}));

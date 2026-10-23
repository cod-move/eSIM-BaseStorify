import { create } from 'zustand';

import type { AppUpdateRequiredDetails } from '@/contracts/mobile/biz/v1';

/**
 * What the store can say that reaches past the screen that asked. The API
 * client raises it; the app gate answers it.
 *
 * "This version is too old" is said to a change only (426): reading goes on,
 * so the app asks to update and does not close. `dismissUpdate` is "not now";
 * the next change the store refuses asks again.
 *
 * The store's maintenance mode never closes the business app (its operators
 * keep working, as on the website's dashboard), so there is no maintenance
 * state here, unlike the shopper app.
 */
type GateState = {
  updateRequired: AppUpdateRequiredDetails | null;
  requireUpdate: (details: AppUpdateRequiredDetails | null) => void;
  dismissUpdate: () => void;
};

/** What the gate holds when the store sent no facts with its refusal. */
const UNKNOWN_MINIMUM: AppUpdateRequiredDetails = { minVersion: '' };

export const useGate = create<GateState>((set) => ({
  updateRequired: null,
  requireUpdate: (details) => set({ updateRequired: details ?? UNKNOWN_MINIMUM }),
  dismissUpdate: () => set({ updateRequired: null }),
}));

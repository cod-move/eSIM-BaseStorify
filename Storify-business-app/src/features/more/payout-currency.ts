import { create } from 'zustand';

import type { Workspace } from '@/contracts/mobile/biz/v1';

/**
 * The currency an operator chose to see their balance in, with the currencies
 * the store offered when they chose, so the choice stays on screen while that
 * currency is read (or cannot be).
 */
export type PayoutCurrencyChoice = { currency: string; offered: readonly string[] };

/**
 * One choice per workspace, for as long as the same person uses the app. Held
 * in memory only: nothing about the seller's money is written to the device.
 */
const useChoices = create<{ chosen: Partial<Record<Workspace, PayoutCurrencyChoice>> }>(() => ({
  chosen: {},
}));

export function useChosenPayoutCurrency(
  workspace: Workspace | null
): PayoutCurrencyChoice | undefined {
  return useChoices((state) => (workspace ? state.chosen[workspace] : undefined));
}

export function choosePayoutCurrency(workspace: Workspace, choice: PayoutCurrencyChoice): void {
  useChoices.setState((state) => ({ chosen: { ...state.chosen, [workspace]: choice } }));
}

/** Forgets every choice: for a change of person, and before each test. */
export function clearPayoutCurrencies(): void {
  useChoices.setState({ chosen: {} });
}

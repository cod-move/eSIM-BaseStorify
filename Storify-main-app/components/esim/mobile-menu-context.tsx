"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { MobileMenuSettings } from "@/lib/esim/storefront/mobile-nav";

/**
 * The side menu the admin set (patch P33), handed from the store layout to
 * the header's menu sheet. Null — or no provider, as in the admin's previews —
 * keeps the store's own menu.
 */
const EsimMobileMenuContext = createContext<MobileMenuSettings | null>(null);

export function EsimMobileMenuProvider({ value, children }: { value: MobileMenuSettings | null; children: ReactNode }) {
  return <EsimMobileMenuContext.Provider value={value}>{children}</EsimMobileMenuContext.Provider>;
}

export function useEsimMobileMenu(): MobileMenuSettings | null {
  return useContext(EsimMobileMenuContext);
}

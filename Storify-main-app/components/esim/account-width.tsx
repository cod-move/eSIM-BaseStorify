"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/hooks/use-locale-navigation";

/**
 * The account's pages as wide as its overview (patch P41): centred, up to
 * `max-w-6xl`. The inbox keeps the whole width for its list and message side
 * by side.
 */
export function EsimAccountWidth({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullWidth = /\/account\/inbox(\/|$)/.test(pathname);
  return fullWidth ? <>{children}</> : <div className="mx-auto w-full max-w-6xl space-y-6">{children}</div>;
}

import type { ReactNode } from "react";

/** The eSIM pages of the account (My eSIMs, balance, numbers, referrals…) as wide as the account's own pages. */
export default function AccountEsimsLayout({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-6xl">{children}</div>;
}

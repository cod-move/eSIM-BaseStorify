"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/hooks/use-locale-navigation";
import Link from "@/components/language/link";

/**
 * The customer's avatar in the store's inbox opens their customer page
 * (patch P70): /admin/customers in the admin inbox, /staff/customers in the
 * staff one. The page takes the account's user id and opens its customer
 * profile (patch P63). A vendor's inbox, the shopper's own inbox and a guest
 * thread (no account) keep the avatar as it was.
 */
export function customerAreaOf(pathname: string | null): "admin" | "staff" | null {
  const match = /(?:^|\/)(admin|staff)\/inbox(?:\/|$)/.exec(pathname ?? "");
  return match ? (match[1] as "admin" | "staff") : null;
}

export function InboxCustomerLink({
  userId,
  label,
  className,
  children,
}: {
  userId?: string | null;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const area = customerAreaOf(usePathname());
  if (!area || !userId) return <>{children}</>;
  return (
    <Link
      href={`/${area}/customers/${userId}`}
      className={className ?? "shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"}
      title={label}
      aria-label={label}
    >
      {children}
    </Link>
  );
}

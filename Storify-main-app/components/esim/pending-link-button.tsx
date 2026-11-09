"use client";

import { useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/hooks/use-locale-navigation";

/**
 * A button that opens a page and shows it is loading until the page is
 * there, for pages that take a while to draw (a top-up page asks the
 * supplier for its list first).
 */
export function PendingLinkButton({ href, children, size = "sm" }: { href: string; children: ReactNode; size?: "sm" | "default" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button size={size} disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.push(href))}>
      {pending ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

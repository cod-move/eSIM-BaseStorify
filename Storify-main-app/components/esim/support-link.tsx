import { LifeBuoy } from "lucide-react";
import Link from "@/components/language/link";

/** "Contact support" about this item, beside a page's back link. */
export function SupportLink({ query, label }: { query: string; label: string }) {
  return (
    <Link href={query ? `/account/esims/support?${query}` : "/account/esims/support"} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      <LifeBuoy className="h-4 w-4" />
      {label}
    </Link>
  );
}

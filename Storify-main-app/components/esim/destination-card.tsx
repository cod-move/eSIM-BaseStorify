"use client";

import { useTranslations } from "next-intl";
import Link from "@/components/language/link";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { flagEmoji, type Continent } from "@/lib/esim/storefront/continents";

/** A destination as the overview, the blocks and search draw it. Serialisable. */
export interface BrowserDestination {
  slug: string;
  name: string;
  emoji: string | null;
  scope: "local" | "regional" | "global";
  continent: Continent | null;
  /** Names of the covered countries, for search. */
  countryNames: string[];
  countryCodes: string[];
  path: string;
  fromPriceMinor: number | null;
}

export function destinationIcon(destination: Pick<BrowserDestination, "scope" | "countryCodes" | "emoji">): string {
  return destination.scope === "local"
    ? flagEmoji(destination.countryCodes[0]) || destination.emoji || "📍"
    : destination.emoji || "🌐";
}

/** One destination: its flag, name, coverage and the price it sells from. */
export function DestinationCard({ destination, showPrice = true }: { destination: BrowserDestination; showPrice?: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const { formatPrice } = useCurrency();
  const price =
    showPrice && destination.fromPriceMinor !== null
      ? t("esim.selector.from", "from {price}", { price: formatPrice(destination.fromPriceMinor / 100) })
      : "";
  const coverage =
    destination.scope === "local" ? "" : t("esim.browse.countries", "{count} countries", { count: destination.countryCodes.length });
  return (
    <Link
      href={destination.path}
      className="flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
      <span className="text-2xl leading-none" aria-hidden="true">
        {destinationIcon(destination)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{destination.name}</span>
        {coverage || price ? (
          <span className="block text-xs text-muted-foreground">{[coverage, price].filter(Boolean).join(" · ")}</span>
        ) : null}
      </span>
    </Link>
  );
}

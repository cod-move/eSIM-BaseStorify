"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Search } from "lucide-react";
import Link from "@/components/language/link";
import { Input } from "@/components/ui/input";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import { CONTINENTS, CONTINENT_LABELS } from "@/lib/esim/storefront/continents";
import { DestinationCard, type BrowserDestination } from "@/components/esim/destination-card";

export type { BrowserDestination } from "@/components/esim/destination-card";

/**
 * Destinations in tabs — countries, regions, global (WEB-30, WEB-12).
 *
 * The overview page uses all of it: a search over every destination (a
 * country also finds the regional and global plans that cover it) and the
 * countries grouped by continent. The tabs block draws it without search,
 * ungrouped, a few per tab, with a link to the overview.
 */

type Tab = "local" | "regional" | "global";

interface DestinationBrowserProps {
  destinations: BrowserDestination[];
  search?: boolean;
  /** Countries under continent headings (the overview). */
  grouped?: boolean;
  /** Most cards per tab; absent shows all. */
  limit?: number;
  /** Tab titles set in the page builder, in place of the defaults. */
  labels?: Partial<Record<Tab, string>>;
  /** A "View all" link under the cards. */
  viewAllHref?: string;
  showPrice?: boolean;
}

export function DestinationBrowser({
  destinations,
  search = true,
  grouped = true,
  limit,
  labels,
  viewAllHref,
  showPrice = true,
}: DestinationBrowserProps) {
  const t = useFallbackTranslator(useTranslations());
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("local");
  const needle = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!needle) return [];
    return destinations
      .filter((destination) =>
        destination.name.toLowerCase().includes(needle) ||
        destination.countryNames.some((country) => country.toLowerCase().includes(needle)),
      )
      .sort((a, b) => {
        // The country itself first, then bundles that cover it.
        const rank = (destination: BrowserDestination) =>
          destination.name.toLowerCase().startsWith(needle) ? 0 : destination.scope === "local" ? 1 : destination.scope === "regional" ? 2 : 3;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      });
  }, [destinations, needle]);

  const byTab = (scope: Tab) => destinations.filter((destination) => destination.scope === scope);
  const allTabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "local", label: labels?.local || t("esim.browse.local", "Countries"), count: byTab("local").length },
    { id: "regional", label: labels?.regional || t("esim.browse.regional", "Regions"), count: byTab("regional").length },
    { id: "global", label: labels?.global || t("esim.browse.global", "Global"), count: byTab("global").length },
  ];
  const tabs = allTabs.filter((entry) => entry.count > 0);
  const active = tabs.some((entry) => entry.id === tab) ? tab : tabs[0]?.id;

  const grid = (items: BrowserDestination[]) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((destination) => (
        <DestinationCard key={destination.path} destination={destination} showPrice={showPrice} />
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      {search ? (
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("esim.browse.search", "Where are you going?")}
            aria-label={t("esim.browse.search", "Where are you going?")}
            className="h-11 pl-9"
          />
        </div>
      ) : null}

      {needle ? (
        matches.length ? (
          grid(matches)
        ) : (
          <p className="text-sm text-muted-foreground">{t("esim.browse.noMatch", "No destination matches \"{query}\".", { query })}</p>
        )
      ) : active ? (
        <>
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b">
            {tabs.map((entry) => (
              <button
                key={entry.id}
                role="tab"
                type="button"
                aria-selected={active === entry.id}
                onClick={() => setTab(entry.id)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                  active === entry.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {entry.label} <span className="text-xs text-muted-foreground">({entry.count})</span>
              </button>
            ))}
          </div>
          {active === "local" && grouped ? (
            <div className="space-y-8">
              {CONTINENTS.map((continent) => {
                const items = byTab("local").filter((destination) => (destination.continent ?? "other") === continent);
                if (!items.length) return null;
                return (
                  <section key={continent} className="space-y-3">
                    <h2 className="text-lg font-semibold">{t(`esim.continent.${continent}`, CONTINENT_LABELS[continent])}</h2>
                    {grid(items)}
                  </section>
                );
              })}
            </div>
          ) : (
            grid(limit ? byTab(active).slice(0, limit) : byTab(active))
          )}
          {viewAllHref ? (
            <Link href={viewAllHref} className="inline-flex items-center gap-1 text-sm font-medium text-store-link hover:underline">
              {t("esim.browse.viewAll", "View all destinations")} <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{t("esim.browse.empty", "No destinations are on sale yet.")}</p>
      )}
    </div>
  );
}

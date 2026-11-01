"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { Flag } from "@/components/esim/flag";
import { searchCountries, type CoveredCountry } from "@/lib/esim/storefront/compare";

/**
 * The countries a regional or global plan covers, each with its operators
 * (WEB-15); a search box once the list is long. A local plan shows its one
 * country's operators. Countries come sorted from the server, in its locale.
 */

const SEARCH_FROM = 12;
const COLLAPSED = 24;

export function CoverageList({ countries, local }: { countries: CoveredCountry[]; local: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const found = useMemo(() => searchCountries(countries, search), [countries, search]);
  const searching = search.trim().length > 0;
  const shown = expanded || searching ? found : found.slice(0, COLLAPSED);

  if (local) {
    const operators = countries[0]?.operators ?? [];
    if (!operators.length) return null;
    return (
      <ul className="grid gap-2 sm:grid-cols-2">
        {operators.map((entry) => (
          <li key={entry.operator} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
            <span>{entry.operator}</span>
            {entry.network ? <span className="text-xs text-muted-foreground">{entry.network}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {countries.length >= SEARCH_FROM ? (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("esim.coverage.search", "Find a country or operator")}
            aria-label={t("esim.coverage.search", "Find a country or operator")}
            className="ps-9"
          />
        </div>
      ) : null}
      {found.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("esim.coverage.notFound", "This plan does not cover that country.")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((country) => (
            <li key={country.code} className="rounded-lg border px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <Flag code={country.code} />
                {country.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {country.operators.length
                  ? country.operators.map((entry) => (entry.network ? `${entry.operator} (${entry.network})` : entry.operator)).join(" · ")
                  : t("esim.coverage.bestAvailable", "The best network available locally")}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!searching && found.length > COLLAPSED ? (
        <button type="button" className="text-sm text-store-link underline-offset-2 hover:underline" onClick={() => setExpanded((value) => !value)}>
          {expanded
            ? t("esim.coverage.showLess", "Show fewer")
            : t("esim.coverage.showAll", "Show all {count} countries", { count: found.length })}
        </button>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { Flag } from "@/components/esim/flag";
import { searchCountries, type CoveredCountry } from "@/lib/esim/storefront/compare";

/**
 * "Coverage and networks" (WEB-15): each country a plan covers, with its
 * operators and their fastest network, opened from a plan card. A search box
 * once the list is long.
 */

const SEARCH_FROM = 12;

export function CoverageDialog({
  open,
  onOpenChange,
  title,
  countries,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  countries: CoveredCountry[];
}) {
  const t = useFallbackTranslator(useTranslations());
  const [search, setSearch] = useState("");
  const found = useMemo(() => searchCountries(countries, search), [countries, search]);
  // Some suppliers name no operators at all: say so once rather than on every country.
  const noOperators = countries.every((country) => country.operators.length === 0);
  const operatorUnknown = t("esim.coverage.operatorUnknown", "Not provided by the supplier. Once installed, the eSIM connects to a local operator automatically.");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("esim.plans.coverageTitle", "Coverage and networks")}</DialogTitle>
          <DialogDescription>{title}</DialogDescription>
        </DialogHeader>
        {noOperators ? (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t("esim.plans.operator", "Operator")}: {operatorUnknown}
          </p>
        ) : null}
        {countries.length >= SEARCH_FROM ? (
          <div className="relative">
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
            {found.map((country) => (
              <li key={country.code} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Flag code={country.code} className="text-base" />
                  {country.name}
                </div>
                {country.operators.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {country.operators.map((entry) => (
                      <span key={entry.operator} className="inline-flex overflow-hidden rounded-full border text-xs">
                        <span className="bg-muted/40 px-2 py-0.5">{entry.operator}</span>
                        {entry.network ? <span className="border-s bg-primary/10 px-2 py-0.5 font-semibold text-primary">{entry.network}</span> : null}
                      </span>
                    ))}
                  </div>
                ) : noOperators ? null : (
                  <p className="text-xs text-muted-foreground">{operatorUnknown}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

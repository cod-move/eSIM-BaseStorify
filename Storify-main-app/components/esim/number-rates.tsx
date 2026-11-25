"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight, Globe, MessageSquare, Satellite, Search, Wifi } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { FlagIcon } from "@/components/ui/flag-icon";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/esim/numbers/line";
import {
  cheapestData,
  outgoingCall,
  perGb,
  rateKey,
  rateTier,
  type NumberRateCountry,
  type NumberRateSurcharge,
  type RateKind,
  type RateTier,
} from "@/lib/esim/numbers/rates";
import { CONTINENTS, CONTINENT_LABELS, type Continent } from "@/lib/esim/storefront/continents";

/**
 * The rates page for phone number eSIMs (NUM-03): pick where you will be and
 * see what calls, texts and data cost there; add a destination to see what a
 * call to it comes to; compare every country in one table. Names come
 * translated from the server (app/[locale]/(store)/esim/numbers/rates).
 */

export type RateCountryView = NumberRateCountry & { key: string; label: string; continent: Continent };
export type RateSurchargeView = NumberRateSurcharge & { key: string; label: string };

const POPULAR = ["GB", "US", "FR", "DE", "ES", "IT", "TH", "TR", "AE", "CN"];
type Sort = "name" | "outgoing" | "sms" | "data";

const TIER_STYLE: Record<RateTier, string> = {
  free: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  low: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  mid: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  high: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};
const TIER_DOT: Record<RateTier, string> = {
  free: "bg-emerald-500",
  low: "bg-sky-500",
  mid: "bg-amber-500",
  high: "bg-rose-500",
};

function Flag({ code, size = 20 }: { code: string | null; size?: number }) {
  if (code && /^[A-Z]{2}$/.test(code) && code !== "AC" && code !== "XK") return <FlagIcon countryCode={code} size={size} alt="" />;
  return <Globe className="shrink-0 text-muted-foreground" style={{ width: size, height: size }} aria-hidden />;
}

export function NumberRates({
  countries,
  surcharges,
  currency,
  asOf,
  initial,
}: {
  countries: RateCountryView[];
  surcharges: RateSurchargeView[];
  currency: string;
  asOf: string;
  initial?: string;
}) {
  const t = useFallbackTranslator(useTranslations());
  const money = (cents: number) => formatAmount(cents, currency);
  const [selectedKey, setSelectedKey] = useState<string | undefined>(
    initial && countries.some((country) => country.key === initial) ? initial : undefined,
  );
  const [destinationKey, setDestinationKey] = useState<string | undefined>();
  const [continent, setContinent] = useState<Continent | "all">("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const cardRef = useRef<HTMLDivElement>(null);

  const selected = countries.find((country) => country.key === selectedKey) ?? null;
  const destination = surcharges.find((entry) => entry.key === destinationKey) ?? null;

  function choose(key: string, scroll = false) {
    setSelectedKey(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("country", key);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // the address only makes the choice shareable
    }
    if (scroll) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tierLabel = (tier: RateTier) =>
    ({
      free: t("esim.numberRates.tierFree", "Free"),
      low: t("esim.numberRates.tierLow", "Low"),
      mid: t("esim.numberRates.tierMid", "Medium"),
      high: t("esim.numberRates.tierHigh", "High"),
    })[tier];
  const continentLabel = (value: Continent) => t(`esim.continent.${value}`, CONTINENT_LABELS[value]);

  const countryOptions = useMemo(
    () =>
      countries.map((country) => ({
        value: country.key,
        label: country.label,
        keywords: `${country.name} ${country.code ?? ""}`,
        icon: <Flag code={country.code} size={18} />,
      })),
    [countries],
  );
  const destinationOptions = useMemo(
    () =>
      surcharges.map((entry) => ({
        value: entry.key,
        label: entry.label,
        keywords: entry.name,
        icon: entry.part === "satellite" ? <Satellite className="size-[18px] text-muted-foreground" /> : <Flag code={entry.code} size={18} />,
      })),
    [surcharges],
  );

  const continents = useMemo(() => CONTINENTS.filter((value) => countries.some((country) => country.continent === value)), [countries]);
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = countries.filter(
      (country) =>
        (continent === "all" || country.continent === continent) &&
        (!needle || country.label.toLowerCase().includes(needle) || country.name.toLowerCase().includes(needle)),
    );
    const value = (country: RateCountryView): number =>
      sort === "outgoing" ? (country.voice?.outgoing ?? Infinity) : sort === "sms" ? (country.sms?.any ?? Infinity) : (cheapestData(country)?.perMb ?? Infinity);
    return sort === "name"
      ? filtered
      : [...filtered].sort((a, b) => value(a) - value(b) || a.label.localeCompare(b.label));
  }, [countries, continent, search, sort]);

  const sortLabels: Record<Sort, string> = {
    name: t("esim.numberRates.sortName", "Country"),
    outgoing: t("esim.numberRates.sortCalls", "Cheapest calls"),
    sms: t("esim.numberRates.sortTexts", "Cheapest texts"),
    data: t("esim.numberRates.sortData", "Cheapest data"),
  };

  return (
    <div className="space-y-10">
      {/* Where you will be */}
      <section ref={cardRef} className="scroll-mt-24 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{t("esim.numberRates.whereTitle", "Where will you use the number?")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("esim.numberRates.whereHint", "Prices depend on the country you are in, not on where the number is from.")}
            </p>
          </div>
          <SearchableSelect
            className="w-full sm:w-72"
            options={countryOptions}
            value={selectedKey}
            onValueChange={(value) => choose(value)}
            ariaLabel={t("esim.numberRates.whereTitle", "Where will you use the number?")}
            placeholder={t("esim.numberRates.pickCountry", "Choose a country")}
            searchPlaceholder={t("esim.numberRates.searchCountry", "Search countries")}
            emptyText={t("esim.numberRates.noCountry", "No country found")}
          />
        </div>

        {!selected ? (
          <div className="mt-6 flex flex-wrap gap-2">
            {POPULAR.map((code) => countries.find((country) => country.code === code))
              .filter((country): country is RateCountryView => Boolean(country))
              .map((country) => (
                <button
                  key={country.key}
                  type="button"
                  onClick={() => choose(country.key)}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
                >
                  <Flag code={country.code} size={18} />
                  {country.label}
                </button>
              ))}
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-3">
              <Flag code={selected.code} size={32} />
              <div>
                <div className="text-xl font-semibold">{selected.label}</div>
                <div className="text-xs text-muted-foreground">{continentLabel(selected.continent)}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile
                icon={<ArrowDownLeft className="size-4" />}
                title={t("esim.numberRates.incoming", "Answering a call")}
                kind="call"
                cents={selected.voice?.incoming}
                price={selected.voice ? perMinute(t, money(selected.voice.incoming)) : null}
                tierLabel={tierLabel}
                missing={t("esim.numberRates.notListed", "Not available here")}
                freeLabel={t("esim.numberRates.freeIncoming", "Free to answer")}
              />
              <Tile
                icon={<ArrowUpRight className="size-4" />}
                title={t("esim.numberRates.outgoing", "Making a call")}
                kind="call"
                cents={selected.voice?.outgoing}
                price={selected.voice ? perMinute(t, money(selected.voice.outgoing)) : null}
                tierLabel={tierLabel}
                missing={t("esim.numberRates.notListed", "Not available here")}
                lines={
                  selected.voice
                    ? [t("esim.numberRates.toTravelSim", "To our other numbers and voicemail: {price}", { price: perMinute(t, money(selected.voice.travelSim)) })]
                    : []
                }
              />
              <Tile
                icon={<MessageSquare className="size-4" />}
                title={t("esim.numberRates.texts", "Sending a text")}
                kind="sms"
                cents={selected.sms?.any}
                price={selected.sms ? t("esim.numberRates.perText", "{price}/text", { price: money(selected.sms.any) }) : null}
                tierLabel={tierLabel}
                missing={t("esim.numberRates.notListed", "Not available here")}
                lines={[
                  ...(selected.sms?.eu != null ? [t("esim.numberRates.toEu", "To EU numbers: {price}", { price: money(selected.sms.eu) })] : []),
                  ...(selected.sms?.travelSim != null
                    ? [t("esim.numberRates.smsTravelSim", "To our other numbers: {price}", { price: money(selected.sms.travelSim) })]
                    : []),
                ]}
              />
              <DataTile country={selected} money={money} t={t} tierLabel={tierLabel} />
            </div>

            {/* A call to somewhere that costs more */}
            {selected.voice ? (
              <div className="rounded-xl bg-muted/50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t("esim.numberRates.calcTitle", "Calling a far-off place or a satellite phone?")}</div>
                    <div className="text-xs text-muted-foreground">
                      {t("esim.numberRates.calcHint", "Some destinations add a surcharge per minute. Pick one to see the total.")}
                    </div>
                  </div>
                  <SearchableSelect
                    className="w-full sm:w-72"
                    options={destinationOptions}
                    value={destinationKey}
                    onValueChange={setDestinationKey}
                    ariaLabel={t("esim.numberRates.calcTitle", "Calling a far-off place or a satellite phone?")}
                    placeholder={t("esim.numberRates.pickDestination", "Choose a destination")}
                    searchPlaceholder={t("esim.numberRates.searchDestination", "Search destinations")}
                    emptyText={t("esim.numberRates.noDestination", "No surcharge for that destination")}
                  />
                </div>
                {destination ? (
                  <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span className="text-muted-foreground">{money(selected.voice.outgoing)}</span>
                    <span className="text-muted-foreground">+</span>
                    <span className="text-muted-foreground">
                      {t("esim.numberRates.surcharge", "{price} surcharge", { price: money(destination.add) })}
                    </span>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-lg font-semibold">{perMinute(t, money(outgoingCall(selected, destination) ?? 0))}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* Every country */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("esim.numberRates.compareTitle", "Compare all countries")}</h2>
          <p className="text-sm text-muted-foreground">{t("esim.numberRates.compareHint", "Tap a country to see its full rates.")}</p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(["all", ...continents] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setContinent(value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  continent === value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {value === "all" ? t("esim.numberRates.allRegions", "All") : continentLabel(value)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-56 lg:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("esim.numberRates.searchCountry", "Search countries")}
                className="pl-9"
                aria-label={t("esim.numberRates.searchCountry", "Search countries")}
              />
            </div>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label={t("esim.numberRates.sortBy", "Sort by")}
            >
              {(Object.keys(sortLabels) as Sort[]).map((value) => (
                <option key={value} value={value}>
                  {sortLabels[value]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Legend t={t} tierLabel={tierLabel} />

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("esim.numberRates.colCountry", "Country")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("esim.numberRates.colIncoming", "Answer /min")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("esim.numberRates.colOutgoing", "Call /min")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("esim.numberRates.colText", "Text")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("esim.numberRates.colData", "Data /MB")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((country) => {
                const data = cheapestData(country);
                return (
                  <tr
                    key={country.key}
                    onClick={() => choose(country.key, true)}
                    className={cn("cursor-pointer border-t transition-colors hover:bg-muted/40", country.key === selectedKey && "bg-primary/5")}
                  >
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2">
                        <Flag code={country.code} size={18} />
                        <span className="font-medium">{country.label}</span>
                      </span>
                    </td>
                    <Cell kind="call" cents={country.voice?.incoming} money={money} freeLabel={tierLabel("free")} />
                    <Cell kind="call" cents={country.voice?.outgoing} money={money} freeLabel={tierLabel("free")} />
                    <Cell kind="sms" cents={country.sms?.any} money={money} freeLabel={tierLabel("free")} />
                    <Cell kind="data" cents={data?.perMb} money={money} freeLabel={tierLabel("free")} />
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    {t("esim.numberRates.noCountry", "No country found")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Surcharged destinations */}
      <Surcharges surcharges={surcharges} money={money} t={t} />

      {/* The small print */}
      <section className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground sm:p-6">
        <h2 className="mb-2 font-semibold text-foreground">{t("esim.numberRates.notesTitle", "Good to know")}</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("esim.numberRates.noteCredit", "These are pay-as-you-go prices, taken from the number's credit ({currency}).", { currency })}</li>
          <li>{t("esim.numberRates.noteMinute", "Calls are charged per started minute, with no connection fee.")}</li>
          <li>{t("esim.numberRates.noteData", "Data is charged in small steps (1, 10 or 100 KB, depending on the network).")}</li>
          <li>{t("esim.numberRates.notePackage", "A data package is usually much cheaper than paying per MB.")}</li>
          <li>{t("esim.numberRates.noteTax", "Prices exclude any local taxes. Rates as of {date}.", { date: asOf })}</li>
        </ul>
        <Link href="/esim/numbers" className="mt-4 inline-flex font-medium text-primary hover:underline">
          {t("esim.numberRates.backToNumbers", "Choose a number")} →
        </Link>
      </section>
    </div>
  );
}

type T = ReturnType<typeof useFallbackTranslator>;

const perMinute = (t: T, price: string) => t("esim.numberRates.perMinute", "{price}/min", { price });

function Tile({
  icon,
  title,
  kind,
  cents,
  price,
  tierLabel,
  missing,
  freeLabel,
  lines = [],
}: {
  icon: React.ReactNode;
  title: string;
  kind: RateKind;
  cents: number | undefined;
  price: string | null;
  tierLabel: (tier: RateTier) => string;
  missing: string;
  freeLabel?: string;
  lines?: string[];
}) {
  const tier = cents == null ? null : rateTier(kind, cents);
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          {icon}
          {title}
        </span>
        {tier ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TIER_STYLE[tier])}>{tierLabel(tier)}</span> : null}
      </div>
      <div className="text-2xl font-semibold tracking-tight">
        {price == null ? <span className="text-base font-normal text-muted-foreground">{missing}</span> : tier === "free" && freeLabel ? freeLabel : price}
      </div>
      {lines.length ? (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DataTile({ country, money, t, tierLabel }: { country: RateCountryView; money: (cents: number) => string; t: T; tierLabel: (tier: RateTier) => string }) {
  const best = cheapestData(country);
  const [open, setOpen] = useState(false);
  const tier = best ? rateTier("data", best.perMb) : null;
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Wifi className="size-4" />
          {t("esim.numberRates.data", "Mobile data")}
        </span>
        {tier ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", TIER_STYLE[tier])}>{tierLabel(tier)}</span> : null}
      </div>
      <div className="text-2xl font-semibold tracking-tight">
        {best ? (
          t("esim.numberRates.perMb", "{price}/MB", { price: money(best.perMb) })
        ) : (
          <span className="text-base font-normal text-muted-foreground">{t("esim.numberRates.notListed", "Not available here")}</span>
        )}
      </div>
      {best && country.data ? (
        <div className="space-y-1 text-xs text-muted-foreground">
          <div>{t("esim.numberRates.perGb", "About {price} per GB", { price: money(perGb(best.perMb)) })}</div>
          <button type="button" className="text-primary hover:underline" onClick={() => setOpen((value) => !value)}>
            {t("esim.numberRates.networks", "Networks ({count})", { count: country.data.length })}
          </button>
          {open ? (
            <ul className="space-y-0.5">
              {country.data.map((net) => (
                <li key={`${net.network}-${net.perMb}-${net.stepKb}`} className="flex justify-between gap-2">
                  <span className="truncate">{net.network}</span>
                  <span className="shrink-0 tabular-nums">
                    {money(net.perMb)} · {t("esim.numberRates.step", "per {kb} KB", { kb: net.stepKb })}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Cell({ kind, cents, money, freeLabel }: { kind: RateKind; cents: number | undefined; money: (cents: number) => string; freeLabel: string }) {
  if (cents == null) return <td className="px-3 py-2 text-right text-muted-foreground">—</td>;
  const tier = rateTier(kind, cents);
  return (
    <td className="px-3 py-2 text-right">
      <span className={cn("inline-block min-w-14 rounded-md px-2 py-0.5 text-center text-xs font-medium tabular-nums", TIER_STYLE[tier])}>
        {tier === "free" ? freeLabel : money(cents)}
      </span>
    </td>
  );
}

function Legend({ t, tierLabel }: { t: T; tierLabel: (tier: RateTier) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>{t("esim.numberRates.legend", "Colours:")}</span>
      {(["free", "low", "mid", "high"] as const).map((tier) => (
        <span key={tier} className="flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", TIER_DOT[tier])} />
          {tierLabel(tier)}
        </span>
      ))}
    </div>
  );
}

function Surcharges({ surcharges, money, t }: { surcharges: RateSurchargeView[]; money: (cents: number) => string; t: T }) {
  const [showSatellite, setShowSatellite] = useState(false);
  const places = surcharges.filter((entry) => entry.part !== "satellite").sort((a, b) => a.label.localeCompare(b.label));
  const satellite = surcharges.filter((entry) => entry.part === "satellite");
  const satelliteFrom = satellite.length ? Math.min(...satellite.map((entry) => entry.add)) : 0;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{t("esim.numberRates.surchargeTitle", "Destinations that cost more to call")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("esim.numberRates.surchargeHint", "Calling these adds the amount shown to the per-minute price of the country you are in.")}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {places.map((entry) => (
          <Badge key={entry.key} variant="outline" className="gap-1.5 py-1 font-normal">
            <Flag code={entry.code} size={16} />
            {entry.label}
            <span className="font-medium tabular-nums">+{money(entry.add)}</span>
          </Badge>
        ))}
      </div>
      {satellite.length ? (
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <button type="button" className="flex items-center gap-2 font-medium" onClick={() => setShowSatellite((value) => !value)}>
            <Satellite className="size-4" />
            {t("esim.numberRates.satellite", "Satellite and special networks ({count}): from +{price}/min", {
              count: satellite.length,
              price: money(satelliteFrom),
            })}
          </button>
          {showSatellite ? (
            <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              {satellite.map((entry) => (
                <li key={entry.key} className="flex justify-between gap-2">
                  <span className="truncate">{entry.label}</span>
                  <span className="shrink-0 tabular-nums">+{money(entry.add)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

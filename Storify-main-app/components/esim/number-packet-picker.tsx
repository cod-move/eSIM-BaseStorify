"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Globe2 } from "lucide-react";
import { CoverageDialog } from "@/components/esim/coverage-dialog";
import { Flag } from "@/components/esim/flag";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { formatAmount } from "@/lib/esim/numbers/line";
import { packetGroups, packetVolume, perGbMinor } from "@/lib/esim/numbers/packet-groups";
import type { CoveredCountry } from "@/lib/esim/storefront/compare";
import { cn } from "@/lib/utils";

interface Packet {
  id: string;
  name: string;
  volumeMb: number | null;
  validityDays: number;
  countryCodes: string[];
  priceMinor: number;
}

/** Flags shown in a group's header before "+N". */
const SHOWN_FLAGS = 14;

/**
 * Data packages for a number as cards, grouped by the countries they cover
 * (as other number shops list them): each card has the data, how long it
 * lasts, the price and the price per GB, and its countries — named in the
 * page's language, with flags.
 */
export function NumberPacketPicker({ packets, currency, value, onChange }: { packets: Packet[]; currency: string; value: string; onChange: (id: string) => void }) {
  const t = useFallbackTranslator(useTranslations());
  const locale = useLocale();
  const [coverage, setCoverage] = useState<{ title: string; countries: CoveredCountry[] } | null>(null);
  const nameOf = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale, "en"], { type: "region" });
    } catch {
      names = null;
    }
    return (code: string) => {
      try {
        return names?.of(code.toUpperCase()) ?? code;
      } catch {
        return code;
      }
    };
  }, [locale]);
  const groups = useMemo(() => packetGroups(packets, nameOf), [packets, nameOf]);
  const countriesOf = (codes: string[]): CoveredCountry[] =>
    codes.map((code) => ({ code, name: nameOf(code), operators: [] })).sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="max-h-[60vh] space-y-5 overflow-y-auto pe-1">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold">
              {group.codes.length === 1
                ? nameOf(group.codes[0])
                : group.codes.length
                  ? t("esim.numbers.packetCountriesCount", "{count} countries", { count: group.codes.length })
                  : t("esim.numbers.packetWorldwide", "Where the number works")}
            </h3>
            {group.codes.length > 1 ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{group.names.slice(0, 12).join(", ")}{group.names.length > 12 ? "…" : ""}</p>
            ) : null}
            {group.codes.length ? (
              <div className="flex flex-wrap items-center gap-1">
                {group.codes.slice(0, SHOWN_FLAGS).map((code) => (
                  <span key={code} title={nameOf(code)}>
                    <Flag code={code} className="rounded-[2px] shadow-sm" />
                  </span>
                ))}
                {group.codes.length > SHOWN_FLAGS ? <span className="text-xs text-muted-foreground">+{group.codes.length - SHOWN_FLAGS}</span> : null}
              </div>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.packets.map((packet) => {
              const chosen = packet.id === value;
              const perGb = perGbMinor(packet.priceMinor, packet.volumeMb);
              return (
                <div
                  key={packet.id}
                  role="radio"
                  aria-checked={chosen}
                  tabIndex={0}
                  onClick={() => onChange(packet.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onChange(packet.id);
                    }
                  }}
                  className={cn(
                    "relative cursor-pointer space-y-2 rounded-xl border p-3 text-sm transition-colors",
                    chosen ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-foreground/40",
                  )}
                >
                  {chosen ? <Check className="absolute end-2 top-2 h-4 w-4 text-primary" /> : null}
                  <div className="pe-5 font-semibold leading-snug">{packet.name}</div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">{t("esim.numbers.packetData", "Data")}</dt>
                    <dd className="text-end font-medium">{packetVolume(packet.volumeMb) ?? "—"}</dd>
                    <dt className="text-muted-foreground">{t("esim.numbers.packetValidity", "Validity")}</dt>
                    <dd className="text-end font-medium">{t("esim.numbers.days", "{days} days", { days: packet.validityDays })}</dd>
                    <dt className="text-muted-foreground">{t("esim.numbers.packetPrice", "Price")}</dt>
                    <dd className="text-end">
                      <span className="font-semibold">{formatAmount(packet.priceMinor, currency)}</span>
                      {perGb !== null ? <span className="ms-1 text-muted-foreground">({t("esim.numbers.perGb", "{price}/GB", { price: formatAmount(perGb, currency) })})</span> : null}
                    </dd>
                  </dl>
                  {packet.countryCodes.length ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-store-link hover:underline"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCoverage({ title: packet.name, countries: countriesOf(packet.countryCodes) });
                      }}
                    >
                      <Globe2 className="h-3.5 w-3.5" />
                      {packet.countryCodes.length === 1 ? nameOf(packet.countryCodes[0]) : t("esim.numbers.packetCountriesCount", "{count} countries", { count: packet.countryCodes.length })}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <CoverageDialog open={coverage !== null} onOpenChange={(next) => !next && setCoverage(null)} title={coverage?.title ?? ""} countries={coverage?.countries ?? []} />
    </div>
  );
}

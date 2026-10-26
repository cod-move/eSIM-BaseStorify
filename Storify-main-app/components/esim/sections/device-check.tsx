"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Info, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import { ESIM_DEVICES, searchDevices } from "@/lib/esim/storefront/devices";

/**
 * "Does my phone take an eSIM?" (WEB-16): pick a brand, type the model.
 * A model not found is not proof it cannot: the advice to check the phone's
 * own settings is always shown.
 */
export function DeviceCheck() {
  const t = useFallbackTranslator(useTranslations());
  const [brand, setBrand] = useState<string>(ESIM_DEVICES[0]?.brand ?? "");
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchDevices(query, brand || undefined, 80), [query, brand]);
  // The caveat most of the listed models share is said once, above them;
  // a model with a different one keeps it beside its name.
  const shared = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of results) if (model.note) counts.set(model.note, (counts.get(model.note) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  }, [results]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {ESIM_DEVICES.map((entry) => (
          <button
            key={entry.brand}
            type="button"
            aria-pressed={brand === entry.brand}
            onClick={() => setBrand(entry.brand)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              brand === entry.brand ? "border-primary bg-primary/10 font-medium" : "hover:border-foreground/40",
            )}
          >
            {entry.brand}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("esim.devices.search", "Type your model, e.g. iPhone 15")}
          aria-label={t("esim.devices.search", "Type your model, e.g. iPhone 15")}
          className="h-11 pl-9"
        />
      </div>
      {results.length ? (
        <div className="space-y-2">
          {shared ? <p className="text-xs text-muted-foreground">{shared}</p> : null}
          <ul className="grid max-h-96 gap-x-4 gap-y-1 overflow-y-auto rounded-xl border p-3 sm:grid-cols-2">
            {results.map((model) => (
              <li key={`${model.brand}-${model.name}`} className="flex items-start gap-2 py-1 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <div>{model.name}</div>
                  {model.note && model.note !== shared ? <div className="text-xs text-muted-foreground">{model.note}</div> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
          {t("esim.devices.notFound", "That model is not on our list. It may still take an eSIM — check your phone's settings.")}
        </p>
      )}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t(
          "esim.devices.howToCheck",
          "To be sure: on iPhone open Settings → General → About and look for \"Digital SIM\" or \"Available SIM\"; on Android dial *#06# and look for an EID. The phone must also be carrier-unlocked.",
        )}
      </p>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import Link from "@/components/language/link";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { destinationIcon, type BrowserDestination } from "@/components/esim/destination-card";

/**
 * The destination search of the hero block (WEB-10): matches as you type,
 * Enter opens the first. A country also finds the bundles that cover it.
 */
export function HeroSearch({
  destinations,
  placeholder,
  popular,
}: {
  destinations: BrowserDestination[];
  placeholder: string;
  popular: BrowserDestination[];
}) {
  const t = useFallbackTranslator(useTranslations());
  const { formatPrice } = useCurrency();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const needle = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!needle) return [];
    return destinations
      .filter(
        (destination) =>
          destination.name.toLowerCase().includes(needle) ||
          destination.countryNames.some((country) => country.toLowerCase().includes(needle)),
      )
      .sort((a, b) => {
        const rank = (destination: BrowserDestination) =>
          destination.name.toLowerCase().startsWith(needle) ? 0 : destination.scope === "local" ? 1 : destination.scope === "regional" ? 2 : 3;
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [destinations, needle]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          if (matches[0]) router.push(matches[0].path);
          else router.push("/esim");
        }}
      >
        <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-14 w-full rounded-full border bg-background ps-12 pe-4 text-base text-foreground shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {open && needle ? (
          <ul className="absolute inset-x-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-2xl border bg-popover p-1 text-start text-popover-foreground shadow-xl">
            {matches.length ? (
              matches.map((destination) => (
                <li key={destination.path}>
                  <Link href={destination.path} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-muted">
                    <span className="text-xl" aria-hidden="true">{destinationIcon(destination)}</span>
                    <span className="flex-1 truncate">{destination.name}</span>
                    {destination.fromPriceMinor !== null ? (
                      <span className="text-xs text-muted-foreground">
                        {t("esim.selector.from", "from {price}", { price: formatPrice(destination.fromPriceMinor / 100) })}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                {t("esim.browse.noMatch", "No destination matches \"{query}\".", { query })}
              </li>
            )}
          </ul>
        ) : null}
      </form>
      {popular.length ? (
        <div className="flex flex-wrap justify-center gap-2">
          {popular.map((destination) => (
            <Link
              key={destination.path}
              href={destination.path}
              className="rounded-full border bg-background/80 px-3 py-1.5 text-sm text-foreground backdrop-blur hover:border-primary"
            >
              <span aria-hidden="true">{destinationIcon(destination)} </span>
              {destination.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

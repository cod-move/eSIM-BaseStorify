import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { StoreBreadcrumb } from "@/components/store/store-breadcrumb";
import { NumberRates, type RateCountryView, type RateSurchargeView } from "@/components/esim/number-rates";
import { translator } from "@/lib/esim/i18n/server";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { rateContinent, rateKey } from "@/lib/esim/numbers/rates";
import { NUMBER_RATE_COUNTRIES, NUMBER_RATE_SURCHARGES, NUMBER_RATES_AS_OF, NUMBER_RATES_CURRENCY } from "@/lib/esim/numbers/rates-data";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const tr = await translator(locale);
  const title = tr("esim.numberRates.seoTitle", "Phone number eSIM rates: calls, texts and data by country");
  const description = tr(
    "esim.numberRates.seoDescription",
    "What a phone number eSIM costs to use in each country: answering and making calls, texts and mobile data, pay as you go.",
  );
  return { title, description, openGraph: { title, description } };
}

/** A country's name in the page's language, else TopConnect's English one. */
function regionNamer(locale: string) {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale.replace(/-hant$/i, "-Hant")], { type: "region", fallback: "none" });
  } catch {
    names = null;
  }
  return (code: string | null, fallback: string) => {
    if (!code || !names) return fallback;
    try {
      return names.of(code) ?? fallback;
    } catch {
      return fallback;
    }
  };
}

/** The numbers' pay-as-you-go rates (NUM-03), from TopConnect's retail price list. */
export default async function EsimNumberRatesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const initial = typeof query.country === "string" ? query.country : undefined;
  const [tr, { storeDefault }] = await Promise.all([translator(locale), getLocaleRouting()]);
  const nameOf = regionNamer(locale);
  const collator = new Intl.Collator(locale);

  const countries: RateCountryView[] = NUMBER_RATE_COUNTRIES.map((country) => ({
    ...country,
    key: rateKey(country),
    label: nameOf(country.code, country.name),
    continent: rateContinent(country),
  })).sort((a, b) => collator.compare(a.label, b.label));

  const surcharges: RateSurchargeView[] = NUMBER_RATE_SURCHARGES.map((entry, index) => {
    const country = nameOf(entry.code, entry.name);
    const label =
      entry.part === "mobile"
        ? tr("esim.numberRates.partMobile", "{country} (mobile)", { country })
        : entry.part === "rural"
          ? tr("esim.numberRates.partRural", "{country} (rural numbers)", { country })
          : entry.part === "easter_island"
            ? tr("esim.numberRates.partEasterIsland", "Easter Island ({country})", { country })
            : entry.part === "external_territories"
              ? tr("esim.numberRates.partExternal", "Australian external territories")
              : entry.part === "satellite"
                ? entry.name
                : country;
    return { ...entry, key: `${index}`, label };
  });

  return (
    <div className="container mx-auto px-4 py-8 lg:py-12">
      <StoreBreadcrumb
        className="mb-4"
        locale={locale}
        storeDefault={storeDefault}
        items={[
          { label: tr("esim.browse.title", "eSIM destinations"), href: "/esim" },
          { label: tr("esim.numbers.title", "Phone numbers"), href: "/esim/numbers" },
          { label: tr("esim.numberRates.title", "Rates") },
        ]}
      />
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{tr("esim.numberRates.heading", "Calls, texts and data: what they cost")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {tr(
            "esim.numberRates.description",
            "A phone number eSIM works in {count} countries. Choose where you will be to see its prices, or compare them all below.",
            { count: countries.length },
          )}
        </p>
      </div>
      <NumberRates countries={countries} surcharges={surcharges} currency={NUMBER_RATES_CURRENCY} asOf={NUMBER_RATES_AS_OF} initial={initial} />
    </div>
  );
}

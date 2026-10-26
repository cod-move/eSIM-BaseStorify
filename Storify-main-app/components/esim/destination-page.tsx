import { translator } from "@/lib/esim/i18n/server";
import { Globe2, QrCode, ShoppingBag, Signal, Wifi } from "lucide-react";
import Link from "@/components/language/link";
import { StoreBreadcrumb } from "@/components/store/store-breadcrumb";
import { PlanSelector } from "@/components/esim/plan-selector";
import { JsonLd } from "@/lib/site-config/seo";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { getStorefrontMetadataSettings } from "@/lib/storefront/storefront-metadata";
import { flagEmoji } from "@/lib/esim/storefront/continents";
import { regionNamesFor, type DestinationDetail } from "@/lib/esim/storefront/catalog";

/**
 * A destination's page (WEB-31..33): what it covers, the plan selector, the
 * networks, how it works and the usual questions. The country, region and
 * global routes all draw it; they differ in the breadcrumb and the coverage
 * list.
 */

/** Title and description for the page's metadata. */
export async function destinationSeo(destination: DestinationDetail, locale: string) {
  const tr = await translator(locale);
  const { storeName, defaultCurrency } = await getStorefrontMetadataSettings();
  const price = destination.fromPriceMinor !== null
    ? new Intl.NumberFormat(locale, { style: "currency", currency: defaultCurrency || "USD" }).format(destination.fromPriceMinor / 100)
    : null;
  const title = tr("esim.page.seoTitle", "{name} eSIM — data plans for travel", { name: destination.name });
  const description = price
    ? tr("esim.page.seoDescriptionPrice", "Prepaid {name} eSIM data plans from {price}. Install in minutes, no roaming charges. {store}", {
        name: destination.name,
        price,
        store: storeName,
      })
    : tr("esim.page.seoDescription", "Prepaid {name} eSIM data plans. Install in minutes, no roaming charges.", { name: destination.name });
  return { title, description };
}

export async function DestinationPage({
  destination,
  locale,
  crumbs,
}: {
  destination: DestinationDetail;
  locale: string;
  crumbs: Array<{ label: string; href?: string }>;
}) {
  const tr = await translator(locale);
  const [{ storeDefault }, { defaultCurrency, storeName }] = await Promise.all([
    getLocaleRouting(),
    getStorefrontMetadataSettings(),
  ]);
  const countryCodes = destination.countries.map((country) => country.code);
  const regionNames = regionNamesFor(destination, locale);
  const icon = destination.scope === "local" ? flagEmoji(countryCodes[0]) || destination.emoji : destination.emoji || "🌐";
  const operators = [...new Set(destination.networks.map((network) => network.operator))];
  const prices = destination.variants.map((variant) => variant.perDay ? variant.perDay.priceMinor * variant.perDay.minDays : variant.priceMinor);
  const faq = [
    {
      q: tr("esim.faq.compatibleQ", "Will it work on my phone?"),
      a: tr("esim.faq.compatibleA", "Your phone must support eSIM and be carrier-unlocked. Most iPhones since the XS, Google Pixel 3 and later, and recent Samsung Galaxy models do."),
    },
    {
      q: tr("esim.faq.whenQ", "When should I install it?"),
      a: tr("esim.faq.whenA", "Install it before you leave, while you have Wi-Fi. The plan starts when it first connects at your destination, unless the plan says otherwise."),
    },
    {
      q: tr("esim.faq.numberQ", "Do I keep my phone number?"),
      a: tr("esim.faq.numberA", "Yes. The eSIM is for data; your usual SIM stays in the phone for calls and texts."),
    },
    {
      q: tr("esim.faq.topupQ", "Can I add more data?"),
      a: tr("esim.faq.topupA", "Plans marked \"Top up this plan\" or \"Add more packages\" can be topped up from My eSIMs."),
    },
  ];

  return (
    <div className="container mx-auto px-4 py-8 lg:py-12">
      <StoreBreadcrumb className="mb-4" locale={locale} storeDefault={storeDefault} items={crumbs} />

      <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-start xl:grid-cols-[1fr_minmax(0,32rem)]">
        <div className="space-y-8">
          <header className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-5xl leading-none" aria-hidden="true">{icon}</span>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {tr("esim.page.title", "{name} eSIM", { name: destination.name })}
                </h1>
                <p className="text-muted-foreground">
                  {destination.scope === "local"
                    ? tr("esim.page.subtitleLocal", "Prepaid data for your trip — install before you fly.")
                    : tr("esim.page.subtitleMulti", "One eSIM for {count} countries.", { count: destination.countries.length })}
                </p>
              </div>
            </div>
          </header>

          {destination.scope !== "local" ? (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Globe2 className="h-5 w-5" /> {tr("esim.page.coverage", "Countries covered")}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {destination.countries.map((country) => (
                  <li key={country.code} className="rounded-full border px-3 py-1 text-sm">
                    <span aria-hidden="true">{flagEmoji(country.code)} </span>
                    {country.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {operators.length ? (
            <section className="space-y-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Signal className="h-5 w-5" /> {tr("esim.page.networks", "Networks")}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {destination.networks.slice(0, 40).map((network) => (
                  <li key={`${network.countryCode}-${network.operator}-${network.network}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span>
                      {destination.scope !== "local" ? <span aria-hidden="true">{flagEmoji(network.countryCode)} </span> : null}
                      {network.operator}
                    </span>
                    {network.network ? <span className="text-xs text-muted-foreground">{network.network}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{tr("esim.page.how", "How it works")}</h2>
            <ol className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: ShoppingBag, title: tr("esim.how.pick", "Pick a plan"), text: tr("esim.how.pickText", "Choose your days and data, pay securely.") },
                { icon: QrCode, title: tr("esim.how.install", "Scan to install"), text: tr("esim.how.installText", "We email a QR code at once. Scan it, or tap the one-tap link.") },
                { icon: Wifi, title: tr("esim.how.land", "Land and connect"), text: tr("esim.how.landText", "Switch data to the eSIM when you arrive. No roaming bills.") },
              ].map((step, index) => (
                <li key={step.title} className="rounded-xl border p-4">
                  <step.icon className="mb-2 h-5 w-5 text-primary" />
                  <div className="font-medium">{index + 1}. {step.title}</div>
                  <p className="text-sm text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{tr("esim.page.faq", "Questions")}</h2>
            <div className="divide-y rounded-xl border">
              {faq.map((item) => (
                <details key={item.q} className="group p-4">
                  <summary className="cursor-pointer list-none font-medium">{item.q}</summary>
                  <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
            <p className="text-sm">
              <Link href={`/products/${destination.productHandle}`} className="text-store-link underline-offset-2 hover:underline">
                {tr("esim.page.allPlans", "See every plan for {name}", { name: destination.name })}
              </Link>
            </p>
          </section>
        </div>

        <aside className="rounded-2xl border bg-card p-5 shadow-sm lg:sticky lg:top-24">
          <PlanSelector
            productId={destination.productId}
            name={tr("esim.page.title", "{name} eSIM", { name: destination.name })}
            variants={destination.variants}
            countryCodes={countryCodes}
            regionNames={regionNames}
            image={destination.image}
          />
        </aside>
      </div>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: `${destination.name} eSIM`,
          brand: { "@type": "Brand", name: storeName },
          category: "eSIM data plan",
          ...(destination.image ? { image: destination.image } : {}),
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: defaultCurrency || "USD",
            lowPrice: (Math.min(...prices) / 100).toFixed(2),
            highPrice: (Math.max(...prices) / 100).toFixed(2),
            offerCount: destination.variants.length,
            availability: "https://schema.org/InStock",
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
        }}
      />
    </div>
  );
}

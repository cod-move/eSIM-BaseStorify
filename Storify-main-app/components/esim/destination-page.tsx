import { translator } from "@/lib/esim/i18n/server";
import { QrCode, ShoppingBag, Wifi } from "lucide-react";
import { coverageByCountry } from "@/lib/esim/storefront/compare";
import { CampaignBanner } from "@/components/esim/campaign-banner";
import { bannerData, campaignForPage } from "@/lib/esim/campaigns/service";
import Link from "@/components/language/link";
import { StoreBreadcrumb } from "@/components/store/store-breadcrumb";
import { PlanBrowser } from "@/components/esim/plan-browser";
import { JsonLd } from "@/lib/site-config/seo";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { getStorefrontMetadataSettings } from "@/lib/storefront/storefront-metadata";
import { DestinationIcon } from "@/components/esim/flag";
import { refreshMissingNetworks, regionNamesFor, type DestinationDetail } from "@/lib/esim/storefront/catalog";

/**
 * A destination's page (WEB-31..33): its plans as filters over cards (each
 * card opens its countries and networks), how it works and the usual
 * questions. The country, region and global routes all draw it; they differ
 * in the breadcrumb.
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
  const [{ storeDefault }, { defaultCurrency, storeName }, campaign] = await Promise.all([
    getLocaleRouting(),
    getStorefrontMetadataSettings(),
    campaignForPage(destination.slug),
  ]);
  const countryCodes = destination.countries.map((country) => country.code);
  const regionNames = regionNamesFor(destination, locale);
  // CAT-10: countries without an operator are asked about once this page is sent.
  refreshMissingNetworks(destination);
  const coverage = coverageByCountry(destination.countries, destination.networks, locale);
  // Each card's own plan: its countries and operators (older cached catalogues have none: the destination's).
  const planCoverage = (destination.coverageSets ?? []).map((set) => coverageByCountry(set.countries, set.networks, locale));
  const local = destination.scope === "local";
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
      {/* WEB-19: a running campaign that covers this destination. */}
      {campaign ? (
        <div className="mb-6">
          <CampaignBanner campaign={bannerData(campaign, locale)} />
        </div>
      ) : null}

      <div className="space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <DestinationIcon destination={{ scope: destination.scope, countryCodes, emoji: destination.emoji }} className="text-5xl leading-none" />
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

        <section id="esim-plan-selector" className="scroll-mt-24 space-y-3">
          <h2 className="text-lg font-semibold">{tr("esim.plans.title", "Choose a plan")}</h2>
          <PlanBrowser
            productId={destination.productId}
            destinationName={destination.name}
            variants={destination.variants}
            countryCodes={countryCodes}
            regionNames={regionNames}
            coverage={coverage}
            planCoverage={planCoverage}
            local={local}
            image={destination.image}
          />
        </section>

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

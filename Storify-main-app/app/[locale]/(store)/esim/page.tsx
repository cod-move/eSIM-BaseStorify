import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { StoreBreadcrumb } from "@/components/store/store-breadcrumb";
import { DestinationBrowser } from "@/components/esim/destination-browser";
import { translator } from "@/lib/esim/i18n/server";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { listDestinations, toBrowserDestination } from "@/lib/esim/storefront/catalog";
import { CampaignBanner } from "@/components/esim/campaign-banner";
import { bannerData, campaignForPage } from "@/lib/esim/campaigns/service";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const tr = await translator(locale);
  const title = tr("esim.browse.seoTitle", "Travel eSIM for 190+ countries");
  const description = tr("esim.browse.seoDescription", "Prepaid eSIM data plans for countries, regions and the whole world. Install in minutes.");
  return { title, description, openGraph: { title, description } };
}

/** Every destination on sale (WEB-30). */
export default async function EsimDestinationsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [tr, { storeDefault }, destinations, campaign] = await Promise.all([translator(locale), getLocaleRouting(), listDestinations(), campaignForPage()]);

  return (
    <div className="container mx-auto px-4 py-8 lg:py-12">
      <StoreBreadcrumb className="mb-4" locale={locale} storeDefault={storeDefault} items={[{ label: tr("esim.browse.title", "eSIM destinations") }]} />
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{tr("esim.browse.title", "eSIM destinations")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {tr("esim.browse.description", "Pick where you are going. Plans for a single country, a whole region, or the world.")}
        </p>
      </div>
      {campaign ? (
        <div className="mb-8">
          <CampaignBanner campaign={bannerData(campaign, locale)} />
        </div>
      ) : null}
      <DestinationBrowser
        destinations={destinations.map(toBrowserDestination)}
      />
    </div>
  );
}

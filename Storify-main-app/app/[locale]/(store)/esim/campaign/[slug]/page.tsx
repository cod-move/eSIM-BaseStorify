import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { StoreBreadcrumb } from "@/components/store/store-breadcrumb";
import { CampaignBanner } from "@/components/esim/campaign-banner";
import { DestinationCard } from "@/components/esim/destination-card";
import { translator } from "@/lib/esim/i18n/server";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { toBrowserDestination } from "@/lib/esim/storefront/catalog";
import { bannerData, getLiveCampaign } from "@/lib/esim/campaigns/service";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const found = await getLiveCampaign(slug);
  if (!found) return {};
  const { campaign } = found;
  const title = campaign.seoTitle || campaign.headline || campaign.name;
  const description = campaign.seoDescription || campaign.description.slice(0, 300) || undefined;
  return { title, description, openGraph: { title, description, images: campaign.imageUrl ? [{ url: campaign.imageUrl }] : undefined } };
}

/** A running campaign (CAT-11): its banner, what it is about, and the destinations it covers with the price after the code. */
export default async function EsimCampaignPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const found = await getLiveCampaign(slug);
  // Not running (a draft, not started, over): no page.
  if (!found) notFound();
  const { campaign, destinations } = found;
  const [tr, { storeDefault }] = await Promise.all([translator(locale), getLocaleRouting()]);

  return (
    <div className="container mx-auto space-y-8 px-4 py-8 lg:py-12">
      <StoreBreadcrumb
        locale={locale}
        storeDefault={storeDefault}
        items={[{ label: tr("esim.browse.title", "eSIM destinations"), href: "/esim" }, { label: campaign.name }]}
      />
      <CampaignBanner campaign={bannerData(campaign, locale)} large />
      {campaign.description ? <p className="max-w-3xl whitespace-pre-line text-muted-foreground">{campaign.description}</p> : null}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{tr("esim.campaign.destinations", "Destinations in this offer")}</h2>
        {destinations.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((destination) => (
              <DestinationCard key={destination.slug} destination={toBrowserDestination(destination)} discountPercent={campaign.discountPercent} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("esim.campaign.noDestinations", "The destinations of this offer are not on sale right now.")}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {tr("esim.campaign.howTo", "Enter the code {code} at checkout. It works on eSIMs for these destinations until the offer ends.", { code: campaign.couponCode })}
        </p>
      </section>
    </div>
  );
}

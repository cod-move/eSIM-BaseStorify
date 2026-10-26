import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DestinationPage, destinationSeo } from "@/components/esim/destination-page";
import { translator } from "@/lib/esim/i18n/server";
import { getDestination } from "@/lib/esim/storefront/catalog";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const destination = await getDestination("global", "multi");
  if (!destination) return {};
  const { title, description } = await destinationSeo(destination, locale);
  return { title, description, openGraph: { title, description } };
}

/**
 * The worldwide plan (WEB-33). Other global bundles, if a supplier names one
 * differently, are listed with the regions at /esim/region/<slug>.
 */
export default async function EsimGlobalPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const destination = await getDestination("global", "multi");
  if (!destination) notFound();
  const tr = await translator(locale);
  return (
    <DestinationPage
      destination={destination}
      locale={locale}
      crumbs={[{ label: tr("esim.browse.title", "eSIM destinations"), href: "/esim" }, { label: destination.name }]}
    />
  );
}

import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DestinationPage, destinationSeo } from "@/components/esim/destination-page";
import { translator } from "@/lib/esim/i18n/server";
import { destinationPath, getDestination } from "@/lib/esim/storefront/catalog";

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const destination = await getDestination(slug, "multi");
  if (!destination) return {};
  const { title, description } = await destinationSeo(destination, locale);
  return { title, description, openGraph: { title, description, images: destination.image ? [{ url: destination.image }] : undefined } };
}

/** A regional (or other multi-country) bundle (WEB-32). */
export default async function EsimRegionPage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const destination = await getDestination(slug, "multi");
  if (!destination) notFound();
  // The global plan lives at /esim/global.
  if (destinationPath(destination) !== `/esim/region/${slug}`) permanentRedirect(destinationPath(destination));
  const tr = await translator(locale);
  return (
    <DestinationPage
      destination={destination}
      locale={locale}
      crumbs={[
        { label: tr("esim.browse.title", "eSIM destinations"), href: "/esim" },
        { label: tr("esim.browse.regional", "Regions") },
        { label: destination.name },
      ]}
    />
  );
}

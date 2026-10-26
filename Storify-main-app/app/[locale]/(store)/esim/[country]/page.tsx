import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DestinationPage, destinationSeo } from "@/components/esim/destination-page";
import { translator } from "@/lib/esim/i18n/server";
import { getDestination } from "@/lib/esim/storefront/catalog";

interface PageProps {
  params: Promise<{ locale: string; country: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, country } = await params;
  const destination = await getDestination(country, "local");
  if (!destination) return {};
  const { title, description } = await destinationSeo(destination, locale);
  return { title, description, openGraph: { title, description, images: destination.image ? [{ url: destination.image }] : undefined } };
}

/** A single country's plans (WEB-31). */
export default async function EsimCountryPage({ params }: PageProps) {
  const { locale, country } = await params;
  setRequestLocale(locale);
  const destination = await getDestination(country, "local");
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

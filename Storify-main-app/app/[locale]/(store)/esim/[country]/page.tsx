import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { DestinationPage, destinationSeo } from "@/components/esim/destination-page";
import { translator } from "@/lib/esim/i18n/server";
import { getLocalizedDestination } from "@/lib/esim/storefront/destination-names";

interface PageProps {
  params: Promise<{ locale: string; country: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, country } = await params;
  const destination = await getLocalizedDestination(country, "local", locale);
  if (!destination) return {};
  const { title, description } = await destinationSeo(destination, locale);
  return { title, description, openGraph: { title, description, images: destination.image ? [{ url: destination.image }] : undefined } };
}

/** A single country's plans (WEB-31). */
export default async function EsimCountryPage({ params }: PageProps) {
  const { locale, country } = await params;
  setRequestLocale(locale);
  const destination = await getLocalizedDestination(country, "local", locale);
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

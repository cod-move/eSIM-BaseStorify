import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AppDownloadView } from "@/components/esim/app-download-view";
import { translator } from "@/lib/esim/i18n/server";
import { getAppDownload } from "@/lib/esim/storefront/app-download";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const tr = await translator(locale);
  const title = tr("esim.app.title", "Stay connected wherever you go");
  const description = tr("esim.app.subtitle", "Buy eSIMs, top up data and manage your numbers on the go.");
  return { title, description, openGraph: { title, description } };
}

/**
 * /esim/app: where to get the shopper app, with the deploy-time links
 * (lib/esim/storefront/app-download.ts). The same block can go on any page
 * through the page builder's "eSIM: App download" section.
 */
export default async function EsimAppPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tr = await translator(locale);
  const app = await getAppDownload();

  return (
    <section className="py-10 md:py-16">
      <AppDownloadView
        tr={tr}
        headingLevel="h1"
        eyebrow={tr("esim.app.eyebrow", "Get the app")}
        title={tr("esim.app.title", "Stay connected wherever you go")}
        subtitle={tr("esim.app.subtitle", "Buy eSIMs, top up data and manage your numbers on the go.")}
        {...app}
      />
    </section>
  );
}

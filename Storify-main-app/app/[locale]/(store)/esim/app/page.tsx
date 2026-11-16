import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Download, Play, Smartphone } from "lucide-react";
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
 * /esim/app: where to get the shopper app. The APK downloads straight from
 * here (with a QR code for a visitor on a computer); the store listings show
 * once their links are set (lib/esim/storefront/app-download.ts).
 */
export default async function EsimAppPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tr = await translator(locale);
  const app = await getAppDownload();
  const soon = tr("esim.app.soon", "Coming soon");

  const storeButton = (href: string | null, label: string, icon: React.ReactNode) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-12 items-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      >
        {icon}
        {label}
      </a>
    ) : (
      <span className="inline-flex h-12 items-center gap-2 rounded-xl border border-dashed border-border px-5 text-sm font-medium text-muted-foreground">
        {icon}
        {label} · {soon}
      </span>
    );

  return (
    <section className="py-10 md:py-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
          <div className="grid items-center gap-8 p-8 md:grid-cols-[1fr_auto] md:p-14">
            <div className="space-y-6">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-100">
                {tr("esim.app.eyebrow", "Get the app")}
              </p>
              <h1 className="text-3xl font-extrabold leading-tight md:text-5xl">
                {tr("esim.app.title", "Stay connected wherever you go")}
              </h1>
              <p className="max-w-xl text-base text-sky-50 md:text-lg">
                {tr("esim.app.subtitle", "Buy eSIMs, top up data and manage your numbers on the go.")}
              </p>

              <div className="flex flex-wrap items-center gap-6">
                {app.apkUrl ? (
                  <div className="space-y-1.5">
                    <a
                      href={app.apkUrl}
                      download
                      className="inline-flex h-14 items-center gap-3 rounded-2xl bg-white px-6 text-base font-bold text-indigo-700 shadow-lg transition-transform hover:-translate-y-0.5"
                    >
                      <Download className="h-5 w-5" />
                      {tr("esim.app.apk", "Download for Android (APK)")}
                    </a>
                    {app.apkVersion && (
                      <p className="text-xs text-sky-100">
                        {tr("esim.app.version", "Version {version}", { version: app.apkVersion })}
                      </p>
                    )}
                  </div>
                ) : (
                  <span className="inline-flex h-14 items-center gap-3 rounded-2xl border border-white/40 px-6 text-base font-semibold text-white/80">
                    <Download className="h-5 w-5" />
                    {tr("esim.app.apk", "Download for Android (APK)")} · {soon}
                  </span>
                )}

                {app.apkQr && (
                  <div className="hidden items-center gap-3 md:flex">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
                    <img src={app.apkQr} alt="" width={96} height={96} className="rounded-xl bg-white p-1.5" />
                    <p className="max-w-[9rem] text-sm text-sky-50">
                      {tr("esim.app.scan", "Scan with your phone to download")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element -- a static illustration */}
            <img
              src="/esim/app-phone.svg"
              alt=""
              width={330}
              height={600}
              className="mx-auto hidden w-56 rotate-6 drop-shadow-2xl md:block lg:w-64"
            />
          </div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">{tr("esim.app.storesTitle", "App stores")}</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {storeButton(app.googlePlayUrl, tr("esim.app.googlePlay", "Google Play"), <Play className="h-4 w-4" />)}
              {storeButton(app.appStoreUrl, tr("esim.app.appStore", "App Store"), <Smartphone className="h-4 w-4" />)}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">{tr("esim.app.stepsTitle", "Installing the APK")}</h2>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{tr("esim.app.step1", "Download the APK on your Android phone.")}</li>
              <li>{tr("esim.app.step2", "Open it. If asked, allow installs from this source (your browser or file manager).")}</li>
              <li>{tr("esim.app.step3", "Tap Install, then open the app and sign in.")}</li>
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

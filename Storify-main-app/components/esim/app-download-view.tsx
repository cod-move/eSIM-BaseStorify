import { Download, Play, Smartphone } from "lucide-react";
import type { Translate } from "@/lib/esim/i18n/server";

export interface AppDownloadViewProps {
  tr: Translate;
  eyebrow: string;
  title: string;
  subtitle: string;
  apkUrl: string | null;
  apkVersion: string | null;
  apkQr: string | null;
  googlePlayUrl: string | null;
  appStoreUrl: string | null;
  /** The picture beside the text; the phone illustration when empty. */
  image?: string | null;
  showSteps?: boolean;
  /** `h1` on the /esim/app page, `h2` as a section on another page. */
  headingLevel?: "h1" | "h2";
}

/**
 * Where to get the shopper app: the APK (with a QR code on a computer), the
 * store listings ("coming soon" until their links are set) and how to install
 * an APK. Drawn by the /esim/app page and the "eSIM: App download" section.
 */
export function AppDownloadView({
  tr,
  eyebrow,
  title,
  subtitle,
  apkUrl,
  apkVersion,
  apkQr,
  googlePlayUrl,
  appStoreUrl,
  image,
  showSteps = true,
  headingLevel = "h2",
}: AppDownloadViewProps) {
  const Heading = headingLevel;
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
    <div className="container mx-auto max-w-6xl px-4">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
        <div className="grid items-center gap-8 p-8 md:grid-cols-[1fr_auto] md:p-14">
          <div className="space-y-6">
            {eyebrow ? (
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-100">{eyebrow}</p>
            ) : null}
            <Heading className="text-3xl font-extrabold leading-tight md:text-5xl">{title}</Heading>
            {subtitle ? <p className="max-w-xl text-base text-sky-50 md:text-lg">{subtitle}</p> : null}

            <div className="flex flex-wrap items-center gap-6">
              {apkUrl ? (
                <div className="space-y-1.5">
                  <a
                    href={apkUrl}
                    download
                    className="inline-flex h-14 items-center gap-3 rounded-2xl bg-white px-6 text-base font-bold text-indigo-700 shadow-lg transition-transform hover:-translate-y-0.5"
                  >
                    <Download className="h-5 w-5" />
                    {tr("esim.app.apk", "Download for Android (APK)")}
                  </a>
                  {apkVersion ? (
                    <p className="text-xs text-sky-100">
                      {tr("esim.app.version", "Version {version}", { version: apkVersion })}
                    </p>
                  ) : null}
                </div>
              ) : (
                <span className="inline-flex h-14 items-center gap-3 rounded-2xl border border-white/40 px-6 text-base font-semibold text-white/80">
                  <Download className="h-5 w-5" />
                  {tr("esim.app.apk", "Download for Android (APK)")} · {soon}
                </span>
              )}

              {apkQr ? (
                <div className="hidden items-center gap-3 md:flex">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
                  <img src={apkQr} alt="" width={96} height={96} className="rounded-xl bg-white p-1.5" />
                  <p className="max-w-[9rem] text-sm text-sky-50">
                    {tr("esim.app.scan", "Scan with your phone to download")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element -- an uploaded picture or the static illustration */}
          <img
            src={image || "/esim/app-phone.svg"}
            alt=""
            className={
              image
                ? "mx-auto hidden max-h-[420px] w-auto rounded-2xl md:block"
                : "mx-auto hidden w-56 rotate-6 drop-shadow-2xl md:block lg:w-64"
            }
          />
        </div>
      </div>

      <div className={`mt-8 grid gap-6 ${showSteps ? "md:grid-cols-2" : ""}`}>
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold">{tr("esim.app.storesTitle", "App stores")}</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {storeButton(googlePlayUrl, tr("esim.app.googlePlay", "Google Play"), <Play className="h-4 w-4" />)}
            {storeButton(appStoreUrl, tr("esim.app.appStore", "App Store"), <Smartphone className="h-4 w-4" />)}
          </div>
        </div>

        {showSteps ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold">{tr("esim.app.stepsTitle", "Installing the APK")}</h3>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>{tr("esim.app.step1", "Download the APK on your Android phone.")}</li>
              <li>{tr("esim.app.step2", "Open it. If asked, allow installs from this source (your browser or file manager).")}</li>
              <li>{tr("esim.app.step3", "Tap Install, then open the app and sign in.")}</li>
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
}

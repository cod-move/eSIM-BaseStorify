import "server-only";

import QRCode from "qrcode";

/**
 * Where the shopper app can be downloaded. The deploy-time defaults, used by
 * the /esim/app page and by an "eSIM: App download" section whose own link
 * fields are left empty:
 *
 * - `ESIM_APP_ANDROID_APK_URL`: the APK, absolute or a path on this site
 *   (e.g. `/downloads/app.apk` for a file in `public/downloads/`).
 * - `ESIM_APP_ANDROID_VERSION`: its version, shown under the button.
 * - `ESIM_APP_GOOGLE_PLAY_URL`, `ESIM_APP_APP_STORE_URL`: the store listings,
 *   once they are live.
 *
 * A link left unset shows as "coming soon".
 */
export interface AppDownload {
  apkUrl: string | null;
  apkVersion: string | null;
  googlePlayUrl: string | null;
  appStoreUrl: string | null;
  /** A QR code (data URL) for the APK, for a visitor on a computer. */
  apkQr: string | null;
}

const read = (name: string) => process.env[name]?.trim() || null;
const pick = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function absolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** A QR code for the APK's address, or null when there is no APK. */
export async function apkQrCode(apkUrl: string | null): Promise<string | null> {
  if (!apkUrl) return null;
  return QRCode.toDataURL(absolute(apkUrl), { width: 320, margin: 1, errorCorrectionLevel: "M" });
}

/**
 * The download links: each one given here (a section's own field) wins,
 * otherwise the deploy-time default.
 */
export async function getAppDownload(
  overrides: Partial<Record<"apkUrl" | "apkVersion" | "googlePlayUrl" | "appStoreUrl", unknown>> = {},
): Promise<AppDownload> {
  const apkUrl = pick(overrides.apkUrl) ?? read("ESIM_APP_ANDROID_APK_URL");
  return {
    apkUrl,
    apkVersion: pick(overrides.apkVersion) ?? read("ESIM_APP_ANDROID_VERSION"),
    googlePlayUrl: pick(overrides.googlePlayUrl) ?? read("ESIM_APP_GOOGLE_PLAY_URL"),
    appStoreUrl: pick(overrides.appStoreUrl) ?? read("ESIM_APP_APP_STORE_URL"),
    apkQr: await apkQrCode(apkUrl),
  };
}

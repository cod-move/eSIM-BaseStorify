import "server-only";

import QRCode from "qrcode";

/**
 * Where the shopper app can be downloaded, for the /esim/app page. Set at
 * deploy time beside the build that produced the APK:
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

function absolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

export async function getAppDownload(): Promise<AppDownload> {
  const apkUrl = read("ESIM_APP_ANDROID_APK_URL");
  return {
    apkUrl,
    apkVersion: read("ESIM_APP_ANDROID_VERSION"),
    googlePlayUrl: read("ESIM_APP_GOOGLE_PLAY_URL"),
    appStoreUrl: read("ESIM_APP_APP_STORE_URL"),
    apkQr: apkUrl
      ? await QRCode.toDataURL(absolute(apkUrl), { width: 320, margin: 1, errorCorrectionLevel: "M" })
      : null,
  };
}

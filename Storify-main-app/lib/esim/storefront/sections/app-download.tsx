import { AppDownloadView } from "@/components/esim/app-download-view";
import { translator } from "@/lib/esim/i18n/server";
import { getAppDownload } from "@/lib/esim/storefront/app-download";
import { lt } from "@/lib/storefront/sections/localized";
import type { LocalizedText, SectionDefinition, SectionRenderContext } from "@/lib/storefront/sections/types";

/**
 * "eSIM: App download": the /esim/app block for any page the page builder
 * edits. Texts are per language; a link field left empty uses the
 * deploy-time default (lib/esim/storefront/app-download.ts), so the section
 * follows a new APK without being edited.
 */

const text = (value: unknown, ctx: SectionRenderContext) => lt(value as LocalizedText, ctx.locale, ctx.defaultLanguage);

export const esimAppDownload: SectionDefinition = {
  type: "esim-app-download",
  version: 1,
  category: "content",
  fields: [
    { key: "eyebrow", type: "text", translatable: true, default: "Get the app" },
    { key: "title", type: "text", translatable: true, default: "Stay connected wherever you go" },
    { key: "subtitle", type: "text", translatable: true, default: "Buy eSIMs, top up data and manage your numbers on the go." },
    { key: "apkUrl", type: "url", default: "" },
    { key: "apkVersion", type: "text", default: "", width: "half" },
    { key: "showQr", type: "toggle", default: true, width: "half" },
    { key: "googlePlayUrl", type: "url", default: "" },
    { key: "appStoreUrl", type: "url", default: "" },
    { key: "image", type: "image" },
    { key: "showSteps", type: "toggle", default: true },
  ],
  async Render({ settings, ctx }) {
    const tr = await translator(ctx.locale);
    const app = await getAppDownload(settings);
    return (
      <section className="py-6 lg:py-10">
        <AppDownloadView
          tr={tr}
          eyebrow={text(settings.eyebrow, ctx)}
          title={text(settings.title, ctx)}
          subtitle={text(settings.subtitle, ctx)}
          {...app}
          apkQr={settings.showQr === false ? null : app.apkQr}
          image={typeof settings.image === "string" ? settings.image : null}
          showSteps={settings.showSteps !== false}
        />
      </section>
    );
  },
};

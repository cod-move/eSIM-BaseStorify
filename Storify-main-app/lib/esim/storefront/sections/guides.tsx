import { Globe2, Plane, QrCode, ShoppingBag, Smartphone, Wifi, type LucideIcon } from "lucide-react";
import { SectionHeading } from "@/components/store/sections/section-shell";
import { DeviceCheck } from "@/components/esim/sections/device-check";
import { InstallGuideTabs } from "@/components/esim/sections/install-guide-tabs";
import { deviceList } from "@/lib/esim/admin/devices";
import { translator } from "@/lib/esim/i18n/server";
import { templateText } from "@/lib/esim/storefront/template-text";
import { lt } from "@/lib/storefront/sections/localized";
import type { LocalizedText, SectionDefinition, SectionRenderContext } from "@/lib/storefront/sections/types";

/**
 * The eSIM blocks that explain (WEB-16..18): how it works in three steps, the
 * iOS / Android install guide, and the device compatibility check.
 */

const text = (value: unknown, ctx: SectionRenderContext) => lt(value as LocalizedText, ctx.locale, ctx.defaultLanguage);

const ICONS: Record<string, LucideIcon> = {
  cart: ShoppingBag,
  qr: QrCode,
  wifi: Wifi,
  plane: Plane,
  phone: Smartphone,
  globe: Globe2,
};

export const esimSteps: SectionDefinition = {
  type: "esim-steps",
  version: 1,
  category: "content",
  fields: [{ key: "title", type: "text", translatable: true, default: "How it works" }],
  blocks: [
    {
      type: "step",
      max: 6,
      fields: [
        { key: "icon", type: "select", options: Object.keys(ICONS), default: "cart" },
        { key: "heading", type: "text", translatable: true, default: "" },
        { key: "text", type: "textarea", translatable: true, default: "" },
      ],
    },
  ],
  starter: {
    blocks: [
      { type: "step", settings: { icon: "cart", heading: "Pick a plan", text: "Choose your destination, days and data. Pay securely." } },
      { type: "step", settings: { icon: "qr", heading: "Scan to install", text: "We email your QR code at once. Scan it, or tap the one-tap link." } },
      { type: "step", settings: { icon: "wifi", heading: "Land and connect", text: "Turn on the eSIM when you arrive. No roaming bills." } },
    ],
  },
  Render({ settings, blocks, ctx }) {
    const steps = blocks.filter((block) => block.visible && text(block.settings.heading, ctx));
    if (!steps.length) return null;
    return (
      <section className="py-5 lg:py-8">
        <div className="container mx-auto px-4">
          <SectionHeading title={text(settings.title, ctx)} className="mb-6 justify-center text-center" />
          <ol className="grid gap-4 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--esim-steps),minmax(0,1fr))]" style={{ ["--esim-steps" as string]: steps.length }}>
            {steps.map((step, index) => {
              const Icon = ICONS[String(step.settings.icon)] ?? ShoppingBag;
              return (
                <li key={step.id} className="relative rounded-2xl border bg-card p-6 text-center">
                  <span className="absolute left-4 top-4 text-sm font-semibold text-muted-foreground">{index + 1}</span>
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div className="font-semibold">{text(step.settings.heading, ctx)}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{text(step.settings.text, ctx)}</p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    );
  },
};

const IOS_STEPS = [
  ["Open the email", "Open the eSIM email on another screen, or tap the iPhone one-tap link on this phone."],
  ["Add eSIM", "Settings → Mobile Service (or Cellular) → Add eSIM → Use QR Code, and scan the code."],
  ["Name it", "Label it \"Travel\" and keep your usual line for calls and texts."],
  ["Turn it on abroad", "On arrival, choose the travel eSIM for Mobile Data and turn on Data Roaming for it."],
];
const ANDROID_STEPS = [
  ["Open the email", "Open the eSIM email on another screen, or tap the Android one-tap link on this phone."],
  ["Add eSIM", "Settings → Network & internet → SIMs → Add eSIM (or Download a SIM) and scan the code."],
  ["Name it", "Label it \"Travel\" and keep your usual line for calls and texts."],
  ["Turn it on abroad", "On arrival, choose the travel eSIM for mobile data and turn on roaming for it."],
];

/** The guide's default steps: what the page builder inserts, and the help page (WEB-35) ships with. */
export const INSTALL_GUIDE_STEPS = [
  ...IOS_STEPS.map(([heading, body]) => ({ type: "step", settings: { platform: "ios", heading, text: body } })),
  ...ANDROID_STEPS.map(([heading, body]) => ({ type: "step", settings: { platform: "android", heading, text: body } })),
];

export const esimInstallGuide: SectionDefinition = {
  type: "esim-install-guide",
  version: 1,
  category: "content",
  fields: [{ key: "title", type: "text", translatable: true, default: "How to install your eSIM" }],
  blocks: [
    {
      type: "step",
      max: 16,
      fields: [
        { key: "platform", type: "select", options: ["ios", "android"], default: "ios" },
        { key: "heading", type: "text", translatable: true, default: "" },
        { key: "text", type: "textarea", translatable: true, default: "" },
        { key: "image", type: "image", default: "" },
      ],
    },
  ],
  starter: { blocks: INSTALL_GUIDE_STEPS },
  Render({ settings, blocks, ctx }) {
    const tabs = [
      { id: "ios", label: "iPhone / iPad" },
      { id: "android", label: "Android" },
    ]
      .map((tab) => ({
        ...tab,
        steps: blocks
          .filter((block) => block.visible && block.settings.platform === tab.id && text(block.settings.heading, ctx))
          .map((block) => ({
            id: block.id,
            title: text(block.settings.heading, ctx),
            text: text(block.settings.text, ctx),
            image: String(block.settings.image ?? ""),
          })),
      }))
      .filter((tab) => tab.steps.length);
    if (!tabs.length) return null;
    return (
      <section className="py-5 lg:py-8">
        <div className="container mx-auto px-4">
          <SectionHeading title={text(settings.title, ctx)} className="mb-6 justify-center text-center" />
          <InstallGuideTabs tabs={tabs} />
        </div>
      </section>
    );
  },
};

export const esimDeviceCheck: SectionDefinition = {
  type: "esim-device-check",
  version: 1,
  category: "content",
  fields: [
    { key: "title", type: "text", translatable: true, default: "Does my phone support eSIM?" },
    { key: "subtitle", type: "textarea", translatable: true, default: "Find your phone to check before you buy." },
  ],
  async Render({ settings, ctx }) {
    const subtitle = text(settings.subtitle, ctx);
    const [list, tr] = await Promise.all([deviceList(), translator(ctx.locale)]);
    // The notes the device list ships, in the page's language (patch P35); an admin's own note stays as written.
    const devices = list.map((entry) => ({ ...entry, models: entry.models.map((model) => (model.note ? { ...model, note: templateText(model.note, tr) } : model)) }));
    return (
      <section className="py-5 lg:py-8">
        <div className="container mx-auto px-4">
          <SectionHeading title={text(settings.title, ctx)} className="mb-2 justify-center text-center" />
          {subtitle ? <p className="mb-6 text-center text-sm text-muted-foreground">{subtitle}</p> : null}
          <DeviceCheck devices={devices} />
        </div>
      </section>
    );
  },
};

import {
  ESSENTIAL_GROUP_PRESETS,
  ESSENTIAL_PRODUCT_PRESET,
} from "@/lib/storefront/themes/presets";
import type { SectionInstance } from "@/lib/storefront/sections/types";
import type { ThemeManifest } from "@/lib/storefront/themes/types";

/**
 * The eSIM storefront theme (WEB-01), added to Storify's theme gallery by
 * patch P2 (`lib/storefront/themes/registry.ts`).
 *
 * Like every Storify theme it is data: tokens over the engine base, and a
 * home page built from the eSIM blocks for a store that has none yet. The
 * product page and the header and footer are Classic's; activating the theme
 * never touches pages a merchant already published. Pure on purpose — the
 * admin gallery reads manifests on the client.
 */

function instance(n: number, type: string, settings: Record<string, unknown> = {}, blocks?: Array<{ type: string; settings?: Record<string, unknown> }>): SectionInstance {
  return {
    id: `preset-esim-travel-${n}`,
    type,
    version: 1,
    visible: true,
    settings,
    ...(blocks
      ? {
          blocks: blocks.map((block, index) => ({
            id: `preset-esim-travel-${n}-${index + 1}`,
            type: block.type,
            visible: true,
            settings: block.settings ?? {},
          })),
        }
      : {}),
  };
}

/** Search first, then what a traveller decides on, then what reassures them. */
export const ESIM_HOME_PRESET: SectionInstance[] = [
  instance(1, "esim-hero"),
  instance(2, "esim-popular", { title: "Popular destinations", source: "auto", scope: "local", limit: 8, desktopColumns: 4 }),
  instance(3, "esim-destination-tabs", { title: "Countries, regions or the whole world", limit: 12 }),
  instance(4, "esim-steps", {}, [
    { type: "step", settings: { icon: "cart", heading: "Pick a plan", text: "Choose your destination, days and data. Pay securely." } },
    { type: "step", settings: { icon: "qr", heading: "Scan to install", text: "We email your QR code at once. Scan it, or tap the one-tap link." } },
    { type: "step", settings: { icon: "wifi", heading: "Land and connect", text: "Turn on the eSIM when you arrive. No roaming bills." } },
  ]),
  instance(5, "esim-device-check"),
  instance(6, "faq", { title: "Questions travellers ask" }, [
    {
      type: "item",
      settings: {
        question: "What is an eSIM?",
        answer: "A SIM card built into your phone. You download a data plan by scanning a QR code — nothing to post, nothing to swap.",
      },
    },
    {
      type: "item",
      settings: {
        question: "When does my plan start?",
        answer: "Most plans start when the eSIM first connects at your destination, so you can install it days before you travel.",
      },
    },
    {
      type: "item",
      settings: {
        question: "Can I keep my own number for calls?",
        answer: "Yes. The eSIM carries data only; your usual SIM stays on for calls and texts.",
      },
    },
    {
      type: "item",
      settings: {
        question: "What if I run out of data?",
        answer: "Plans that allow it can be topped up from My eSIMs, or buy another plan for the same trip.",
      },
    },
  ]),
];

export const esimTheme: ThemeManifest = {
  id: "esim-travel",
  version: "1.0.0",
  status: "stable",
  name: "eSIM Travel",
  description: "A travel eSIM store: destination search, popular countries, plan picker, install help and device check.",
  accent: "from-sky-500 to-indigo-600",
  extends: "essential",
  tokens: {
    // Sky-and-indigo travel palette on a cool white page; dark mode is the engine's.
    colors: {
      light: {
        background: "#f7f9fc",
        surface: "#ffffff",
        surfaceAlt: "#eef4ff",
        text: "#0f172a",
        textMuted: "#64748b",
        border: "#dbe3ef",
        primary: "#2563eb",
        accent: "#0ea5e9",
        link: "#1d4ed8",
      },
    },
    type: {
      headingFont: "plus-jakarta-sans",
      bodyFont: "dm-sans",
      headingWeight: "700",
      headingTracking: -0.02,
    },
    shape: { cardRadius: 16, buttonRadius: 12, badgeRadius: 999, cardBorder: 1, cardShadow: "soft" },
    layout: { pageWidth: "1280", pagePadding: 16 },
    buttons: { height: 44 },
  },
  presets: {
    templates: {
      home: ESIM_HOME_PRESET,
      product: ESSENTIAL_PRODUCT_PRESET,
    },
    groups: ESSENTIAL_GROUP_PRESETS,
  },
};

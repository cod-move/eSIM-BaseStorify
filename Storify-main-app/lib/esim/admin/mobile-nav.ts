import "server-only";

import * as z from "zod";
import { revalidateTag, unstable_cache } from "next/cache";
import { connectDB } from "@/lib/db";
import { EsimSettings, getEsimSettings } from "@/models/esim-pricing.model";
import {
  MAX_MENU_LINKS,
  MAX_TABS,
  MENU_PARTS,
  TAB_ICONS,
  defaultMenu,
  defaultTabs,
  isBuiltInTab,
  isPresetTab,
  type MenuPart,
  type MobileMenuSettings,
  type MobileNavTab,
} from "@/lib/esim/storefront/mobile-nav";

/** The storefront bottom tab bar (patch P32) and side menu (patch P33), set on Admin → eSIM → Mobile navigation. */

const TabSchema = z
  .object({
    key: z.string().regex(/^(?:[a-zA-Z]+|link-[a-z0-9]{1,12})$/),
    enabled: z.boolean(),
    href: z.string().trim().max(500).optional(),
    icon: z.enum(TAB_ICONS).optional(),
    labels: z.record(z.string(), z.string().trim().max(20)).optional(),
  })
  .superRefine((tab, ctx) => {
    if (isBuiltInTab(tab.key) || isPresetTab(tab.key)) return;
    if (!tab.key.startsWith("link-")) {
      ctx.addIssue({ code: "custom", message: `Unknown tab ${tab.key}` });
    } else if (!tab.href || !/^(?:\/(?!\/)|https:\/\/)/.test(tab.href)) {
      ctx.addIssue({ code: "custom", message: "A link needs a store path starting with / or an https:// address" });
    } else if (!Object.values(tab.labels ?? {}).some(Boolean)) {
      ctx.addIssue({ code: "custom", message: "A link needs a name" });
    }
  });

export const MobileNavSchema = z
  .object({ tabs: z.array(TabSchema).max(20) })
  .superRefine(({ tabs }, ctx) => {
    if (new Set(tabs.map((tab) => tab.key)).size !== tabs.length) ctx.addIssue({ code: "custom", message: "A tab is listed twice" });
    const on = tabs.filter((tab) => tab.enabled);
    if (on.length > MAX_TABS) ctx.addIssue({ code: "custom", message: `At most ${MAX_TABS} tabs can be shown` });
    if (tabs.length && !on.some((tab) => tab.key === "menu")) ctx.addIssue({ code: "custom", message: "The Menu tab is the only way into the side menu on a phone" });
  });

export type MobileNavSettings = z.infer<typeof MobileNavSchema>;

function plain(tabs: MobileNavTab[] | undefined): MobileNavTab[] {
  return (tabs ?? []).map((tab) => ({
    key: tab.key,
    enabled: tab.enabled,
    ...(tab.href ? { href: tab.href } : {}),
    ...(tab.icon ? { icon: tab.icon } : {}),
    ...(tab.labels ? { labels: Object.fromEntries(tab.labels instanceof Map ? tab.labels : Object.entries(tab.labels)) } : {}),
  }));
}

function expireStorefront() {
  try {
    revalidateTag("esim-storefront", { expire: 0 });
  } catch {
    // Outside a request.
  }
}

/** What the admin stored; empty means the store's own bar. */
async function readTabs(): Promise<MobileNavTab[]> {
  await connectDB();
  const stored = await EsimSettings.findOne({ key: "default" }, { mobileNav: 1 }).lean();
  return plain(stored?.mobileNav?.tabs);
}

/** The storefront's copy, cached with the other eSIM storefront reads. */
export const storefrontMobileTabs = unstable_cache(readTabs, ["esim-mobile-nav"], { revalidate: 3600, tags: ["esim-storefront"] });

/** The admin form: the stored list, or the store's own bar to start from. */
export async function getMobileNavSettings(): Promise<{ tabs: MobileNavTab[]; custom: boolean }> {
  const tabs = await readTabs();
  return tabs.length ? { tabs, custom: true } : { tabs: defaultTabs(), custom: false };
}

export async function saveMobileNavSettings(next: MobileNavSettings) {
  const before = await readTabs();
  const settings = await getEsimSettings();
  settings.mobileNav = { tabs: next.tabs as MobileNavTab[] };
  await settings.save();
  expireStorefront();
  return { before, after: next.tabs };
}

/* The side menu (patch P33): parts hidden, and eSIM links under Home. */

export const MobileMenuSchema = z
  .object({
    hidden: z.array(z.enum(MENU_PARTS)).max(MENU_PARTS.length),
    links: z.array(TabSchema).max(20),
  })
  .superRefine(({ links }, ctx) => {
    if (links.some((link) => isBuiltInTab(link.key))) ctx.addIssue({ code: "custom", message: "Only eSIM links and own links can be added" });
    if (new Set(links.map((link) => link.key)).size !== links.length) ctx.addIssue({ code: "custom", message: "A link is listed twice" });
    if (links.filter((link) => link.enabled).length > MAX_MENU_LINKS) ctx.addIssue({ code: "custom", message: `At most ${MAX_MENU_LINKS} links can be shown` });
  });

async function readMenu(): Promise<MobileMenuSettings | null> {
  await connectDB();
  const stored = await EsimSettings.findOne({ key: "default" }, { mobileMenu: 1 }).lean();
  const hidden = (stored?.mobileMenu?.hidden ?? []).filter((part): part is MenuPart => (MENU_PARTS as readonly string[]).includes(part));
  const links = plain(stored?.mobileMenu?.links);
  return hidden.length || links.some((link) => link.enabled) ? { hidden, links } : null;
}

/** The storefront's copy; null keeps the store's own side menu. */
export const storefrontMobileMenu = unstable_cache(readMenu, ["esim-mobile-menu"], { revalidate: 3600, tags: ["esim-storefront"] });

/** The admin form: what is stored, or nothing hidden and the presets off. */
export async function getMobileMenuSettings(): Promise<MobileMenuSettings> {
  const stored = await readMenu();
  if (!stored) return defaultMenu();
  // The presets stay on the list, off, so the admin can still turn them on.
  const missing = defaultMenu().links.filter((preset) => !stored.links.some((link) => link.key === preset.key));
  return { hidden: stored.hidden, links: [...stored.links, ...missing] };
}

export async function saveMobileMenuSettings(next: MobileMenuSettings) {
  const before = (await readMenu()) ?? defaultMenu();
  const settings = await getEsimSettings();
  settings.mobileMenu = { hidden: next.hidden, links: next.links };
  await settings.save();
  expireStorefront();
  return { before, after: next };
}

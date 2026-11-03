/**
 * The storefront's bottom tab bar (patch P32) and side menu (patch P33) on
 * phones and tablets, as the admin sets them on Admin → eSIM → Mobile
 * navigation. Nothing stored keeps the store's own. Shared by the storefront,
 * the admin forms and the settings API, so nothing here may touch the server.
 */

/** Tabs the store's bar already draws; the admin only orders and hides them. */
export const BUILT_IN_TABS = ["home", "wishlist", "notifications", "menu", "account"] as const;
/** Ready-made eSIM links. */
export const PRESET_TABS = { esim: "/esim", myEsims: "/account/esims" } as const;
/** Glyphs a custom tab may wear (components/esim/mobile-nav-icons.ts). */
export const TAB_ICONS = ["globe", "smartphone", "sim", "tag", "gift", "help", "chat", "search", "cart", "star", "wallet", "package"] as const;

export type BuiltInTab = (typeof BUILT_IN_TABS)[number];
export type PresetTab = keyof typeof PRESET_TABS;
export type TabIcon = (typeof TAB_ICONS)[number];

export interface MobileNavTab {
  /** A built-in or preset name, or `link-…` for one of the admin's own links. */
  key: string;
  enabled: boolean;
  /** Own links only: a store path ("/esim/japan") or an https:// address. */
  href?: string;
  icon?: TabIcon;
  /** Per-language names; an empty one falls back to the tab's own name. */
  labels?: Record<string, string>;
}

/**
 * Parts of the side menu (patch P33) the admin can hide. Rows: home,
 * products, collections, and the header menu's links ("more"). Sections:
 * categories, the collections block, the account block, language and
 * currency, and the theme switch.
 */
export const MENU_PARTS = ["home", "products", "collections", "more", "categories", "collectionsBlock", "account", "market", "theme"] as const;
export type MenuPart = (typeof MENU_PARTS)[number];

export interface MobileMenuSettings {
  hidden: MenuPart[];
  /** eSIM links listed under Home: the presets and the admin's own, like tabs. */
  links: MobileNavTab[];
}

/** The side menu holds at most this many added links. */
export const MAX_MENU_LINKS = 8;

/** A tab bar holds at most this many; more get too narrow to read. */
export const MAX_TABS = 5;

export function isBuiltInTab(key: string): key is BuiltInTab {
  return (BUILT_IN_TABS as readonly string[]).includes(key);
}

export function isPresetTab(key: string): key is PresetTab {
  return Object.hasOwn(PRESET_TABS, key);
}

/** The store's own bar, in its own order, as a starting point for the admin. */
export function defaultTabs(): MobileNavTab[] {
  return [
    ...BUILT_IN_TABS.map((key) => ({ key, enabled: true })),
    ...(Object.keys(PRESET_TABS) as PresetTab[]).map((key) => ({ key, enabled: false })),
  ];
}

/** The side menu's starting point: nothing hidden, the eSIM presets off. */
export function defaultMenu(): MobileMenuSettings {
  return { hidden: [], links: (Object.keys(PRESET_TABS) as PresetTab[]).map((key) => ({ key, enabled: false })) };
}

/** The name the admin gave a tab in this language, if any. */
export function tabLabel(tab: MobileNavTab, locale: string): string | undefined {
  return tab.labels?.[locale]?.trim() || undefined;
}

/** A store path gets the language prefix every storefront link carries. */
export function tabHref(href: string, locale: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const path = href.startsWith("/") ? href : `/${href}`;
  return path === `/${locale}` || path.startsWith(`/${locale}/`) ? path : `/${locale}${path === "/" ? "" : path}`;
}

/**
 * Lays the bar's own tabs out the way the admin set them. `items` are the
 * tabs the bar built for this viewer (a staff role has no wishlist, and its
 * account tab is the dashboard); `extra` builds a preset or own link. Menu is
 * the only way into the side menu on a phone, so it is kept even if a stored
 * list somehow leaves it out.
 */
export function arrangeTabs<T extends { key: string }>(
  items: T[],
  tabs: readonly MobileNavTab[] | null | undefined,
  extra: (tab: MobileNavTab) => T | null,
  relabel: (item: T, label: string) => T,
  locale: string,
): T[] {
  if (!tabs?.length) return items;
  const byKey = new Map(items.map((item) => [item.key === "dashboard" ? "account" : item.key, item]));
  const out: T[] = [];
  for (const tab of tabs) {
    if (!tab.enabled || out.length >= MAX_TABS) continue;
    const item = isBuiltInTab(tab.key) ? byKey.get(tab.key) : extra(tab);
    if (!item) continue;
    const label = tabLabel(tab, locale);
    // A placeholder has no label to change; it turns into the tab later.
    out.push(label && "label" in item ? relabel(item, label) : item);
  }
  const menu = byKey.get("menu");
  if (menu && !out.some((item) => item.key === "menu")) out.splice(Math.min(out.length, MAX_TABS - 1), out.length >= MAX_TABS ? 1 : 0, menu);
  return out;
}

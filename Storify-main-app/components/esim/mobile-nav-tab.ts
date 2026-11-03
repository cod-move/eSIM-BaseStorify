import {
  CardSim,
  CircleHelp,
  Gift,
  Globe2,
  MessageCircle,
  Package,
  Search,
  ShoppingCart,
  Smartphone,
  Star,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  PRESET_TABS,
  isPresetTab,
  tabHref,
  tabLabel,
  type MobileNavTab,
  type PresetTab,
  type TabIcon,
} from "@/lib/esim/storefront/mobile-nav";

/** The glyphs an admin's own bottom-bar tab can wear (patch P32). */
export const TAB_ICON_COMPONENTS: Record<TabIcon, LucideIcon> = {
  globe: Globe2,
  smartphone: Smartphone,
  sim: CardSim,
  tag: Tag,
  gift: Gift,
  help: CircleHelp,
  chat: MessageCircle,
  search: Search,
  cart: ShoppingCart,
  star: Star,
  wallet: Wallet,
  package: Package,
};

/** What the ready-made eSIM tabs wear unless the admin picks another. */
export const PRESET_TAB_ICONS: Record<PresetTab, TabIcon> = { esim: "globe", myEsims: "sim" };

/**
 * The bottom-bar link for a ready-made eSIM tab or one of the admin's own.
 * `name` reads a message with an English fallback, as the bar does.
 */
export function esimTabLink(
  tab: MobileNavTab,
  locale: string,
  name: (key: string, fallback: string) => string,
): { key: string; href: string; icon: LucideIcon; label: string } | null {
  if (isPresetTab(tab.key)) {
    return {
      key: tab.key,
      href: tabHref(PRESET_TABS[tab.key], locale),
      icon: TAB_ICON_COMPONENTS[tab.icon ?? PRESET_TAB_ICONS[tab.key]],
      label: tabLabel(tab, locale) ?? (tab.key === "esim" ? name("esim.nav.esim", "eSIM") : name("esim.nav.myEsims", "My eSIMs")),
    };
  }
  if (!tab.href) return null;
  // An own link may be named only in some languages; any name beats none.
  const label = tabLabel(tab, locale) ?? Object.values(tab.labels ?? {}).find((value) => value.trim());
  if (!label) return null;
  return { key: tab.key, href: tabHref(tab.href, locale), icon: TAB_ICON_COMPONENTS[tab.icon ?? "package"], label };
}

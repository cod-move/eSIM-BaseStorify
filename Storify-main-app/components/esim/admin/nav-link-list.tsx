"use client";

import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Bell, Heart, Home, Menu, Trash2, User, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { cn } from "@/lib/utils";
import {
  TAB_ICONS,
  isBuiltInTab,
  isPresetTab,
  type BuiltInTab,
  type MobileNavTab,
  type PresetTab,
  type TabIcon,
} from "@/lib/esim/storefront/mobile-nav";
import { PRESET_TAB_ICONS, TAB_ICON_COMPONENTS } from "@/components/esim/mobile-nav-tab";

const BUILT_IN_ICONS: Record<BuiltInTab, LucideIcon> = { home: Home, wishlist: Heart, notifications: Bell, menu: Menu, account: User };

/** A new own link, off when the list already shows `max`. */
export function newNavLink(items: MobileNavTab[], max: number): MobileNavTab {
  const shown = items.filter((item) => item.enabled).length;
  return { key: `link-${Math.random().toString(36).slice(2, 10)}`, enabled: shown < max, href: "/", icon: "package", labels: {} };
}

/**
 * The rows the bottom-bar and side-menu forms share: order, on/off, names per
 * language, and for eSIM and own links an icon; own links also a path.
 */
export function NavLinkList({
  items,
  onChange,
  locales,
  canManage,
  max,
  locked = () => false,
}: {
  items: MobileNavTab[];
  onChange: (items: MobileNavTab[]) => void;
  locales: string[];
  canManage: boolean;
  /** At most this many on; the rest cannot be turned on until one goes off. */
  max: number;
  /** Rows that must stay on. */
  locked?: (key: string) => boolean;
}) {
  const t = useFallbackTranslator(useTranslations());
  const shown = items.filter((item) => item.enabled).length;
  const names: Record<string, string> = {
    home: t("common.home", "Home"),
    wishlist: t("common.wishlist", "Wishlist"),
    notifications: t("common.notifications", "Notifications"),
    menu: t("common.menu", "Menu"),
    account: t("common.account", "Account"),
    esim: t("admin.esim.navPresetEsim", "eSIM destinations"),
    myEsims: t("esim.account.title", "My eSIMs"),
  };

  function update(index: number, patch: Partial<MobileNavTab>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function move(index: number, by: number) {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next);
  }

  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item, index) => {
        const builtIn = isBuiltInTab(item.key);
        const preset = isPresetTab(item.key);
        const icon: TabIcon = item.icon ?? (preset ? PRESET_TAB_ICONS[item.key as PresetTab] : "package");
        const Icon = builtIn ? BUILT_IN_ICONS[item.key as BuiltInTab] : TAB_ICON_COMPONENTS[icon];
        const full = !item.enabled && shown >= max;
        return (
          <li key={item.key} className={cn("space-y-3 p-3", !item.enabled && "bg-muted/40")}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col">
                <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={!canManage || index === 0} onClick={() => move(index, -1)} aria-label={t("admin.esim.navUp", "Move up")}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30" disabled={!canManage || index === items.length - 1} onClick={() => move(index, 1)} aria-label={t("admin.esim.navDown", "Move down")}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <Switch
                checked={item.enabled}
                disabled={!canManage || locked(item.key) || full}
                onCheckedChange={(enabled) => update(index, { enabled })}
                aria-label={t("admin.esim.navShow", "Show")}
              />
              <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
              <span className="min-w-24 text-sm font-medium">{builtIn || preset ? names[item.key] : t("admin.esim.navLink", "Own link")}</span>
              {!builtIn ? (
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  disabled={!canManage}
                  value={icon}
                  onChange={(event) => update(index, { icon: event.target.value as TabIcon })}
                  aria-label={t("admin.esim.navIcon", "Icon")}
                >
                  {TAB_ICONS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : null}
              {!builtIn && !preset ? (
                <>
                  <Input
                    className="h-8 min-w-48 flex-1"
                    disabled={!canManage}
                    value={item.href ?? ""}
                    placeholder="/esim/japan · https://…"
                    onChange={(event) => update(index, { href: event.target.value })}
                    aria-label={t("admin.esim.navHref", "Link")}
                  />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={!canManage} onClick={() => onChange(items.filter((_, i) => i !== index))} aria-label={t("common.delete", "Delete")}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 ps-8">
              {locales.map((code) => (
                <label key={code} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-6 uppercase">{code}</span>
                  <Input
                    className="h-8 w-32"
                    maxLength={20}
                    disabled={!canManage}
                    value={item.labels?.[code] ?? ""}
                    placeholder={builtIn || preset ? t("admin.esim.navDefaultName", "Default name") : ""}
                    onChange={(event) => update(index, { labels: { ...item.labels, [code]: event.target.value } })}
                  />
                </label>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

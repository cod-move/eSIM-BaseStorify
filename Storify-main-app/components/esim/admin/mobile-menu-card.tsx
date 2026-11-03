"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { MAX_MENU_LINKS, MENU_PARTS, type MenuPart, type MobileMenuSettings } from "@/lib/esim/storefront/mobile-nav";
import { NavLinkList, newNavLink } from "@/components/esim/admin/nav-link-list";

/**
 * The storefront's side menu on phones and tablets (patch P33): which of its
 * rows and sections show, and eSIM or own links listed under Home. What the
 * store's header settings already hide stays hidden.
 */
export function MobileMenuCard({ settings, locales, canManage }: { settings: MobileMenuSettings; locales: string[]; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [value, setValue] = useState(settings);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(value) !== JSON.stringify(settings);
  const shown = value.links.filter((link) => link.enabled).length;

  const parts: Record<MenuPart, string> = {
    home: t("admin.esim.menuHome", "Home row"),
    products: t("admin.esim.menuProducts", "All products row"),
    collections: t("admin.esim.menuCollections", "Collections row"),
    more: t("admin.esim.menuMore", "Header menu links and More"),
    categories: t("admin.esim.menuCategories", "Categories"),
    collectionsBlock: t("admin.esim.menuCollectionsBlock", "Collections block"),
    account: t("admin.esim.menuAccount", "Account (profile, orders, sign in)"),
    market: t("admin.esim.menuMarket", "Language and currency"),
    theme: t("admin.esim.menuTheme", "Light and dark switch"),
  };

  function toggle(part: MenuPart, on: boolean) {
    setValue({ ...value, hidden: on ? value.hidden.filter((hidden) => hidden !== part) : [...value.hidden, part] });
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/mobile-menu", value);
      toast.success(t("admin.esim.saved", "Saved"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{t("admin.esim.menuTitle", "Side menu")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.menuHint",
            "The menu the Menu tab opens on phones and tablets. Hide the parts you do not need, and list eSIM pages or your own links under Home. The links in the middle still come from the header menu under Online store → Navigation.",
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.esim.menuParts", "Shown in the menu")}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MENU_PARTS.map((part) => (
              <label key={part} className="flex items-center gap-2.5 rounded-md border px-3 py-2 text-sm">
                <Switch checked={!value.hidden.includes(part)} disabled={!canManage} onCheckedChange={(on) => toggle(part, on)} />
                {parts[part]}
              </label>
            ))}
          </div>
        </section>
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t("admin.esim.menuLinks", "Links under Home")}</h3>
          <NavLinkList items={value.links} onChange={(links) => setValue({ ...value, links })} locales={locales} canManage={canManage} max={MAX_MENU_LINKS} />
        </section>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setValue({ ...value, links: [...value.links, newNavLink(value.links, MAX_MENU_LINKS)] })} disabled={saving}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("admin.esim.navAddLink", "Add a link")}
            </Button>
            <Button size="sm" onClick={save} disabled={!changed || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.save", "Save")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("admin.esim.navCount", "{shown} of {max} shown", { shown, max: MAX_MENU_LINKS })}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

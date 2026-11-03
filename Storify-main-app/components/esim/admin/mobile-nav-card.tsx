"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { MAX_TABS, defaultTabs, type MobileNavTab } from "@/lib/esim/storefront/mobile-nav";
import { NavLinkList, newNavLink } from "@/components/esim/admin/nav-link-list";

/**
 * The storefront's bottom tab bar on phones and tablets (patch P32): which
 * tabs show, in what order, under what name, plus ready-made eSIM tabs and
 * the admin's own links. Until saved, the store's own bar is shown.
 */
export function MobileNavCard({
  settings,
  locales,
  canManage,
}: {
  settings: { tabs: MobileNavTab[]; custom: boolean };
  locales: string[];
  canManage: boolean;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [tabs, setTabs] = useState(settings.tabs);
  const [saving, setSaving] = useState(false);
  const changed = JSON.stringify(tabs) !== JSON.stringify(settings.tabs);
  const shown = tabs.filter((tab) => tab.enabled).length;

  async function post(next: MobileNavTab[], done: string) {
    setSaving(true);
    try {
      await apiClient.post("/api/esim/admin/mobile-nav", { tabs: next });
      toast.success(done);
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
        <CardTitle className="text-base">{t("admin.esim.navTitle", "Bottom tab bar")}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            "admin.esim.navHint",
            "The bar at the bottom of the store on phones and tablets. Turn tabs on or off, put them in order and rename them. At most {max} show; Menu always stays, as it is the only way into the side menu on a phone.",
            { max: MAX_TABS },
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {settings.custom
            ? t("admin.esim.navCustom", "The store shows the bar set here.")
            : t("admin.esim.navDefault", "The store shows its own bar. Save to use the one set here.")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <NavLinkList items={tabs} onChange={setTabs} locales={locales} canManage={canManage} max={MAX_TABS} locked={(key) => key === "menu"} />
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setTabs([...tabs, newNavLink(tabs, MAX_TABS)])} disabled={saving}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t("admin.esim.navAddLink", "Add a link")}
            </Button>
            <Button size="sm" onClick={() => post(tabs, t("admin.esim.saved", "Saved"))} disabled={(!changed && settings.custom) || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.save", "Save")}
            </Button>
            {settings.custom ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setTabs(defaultTabs());
                  void post([], t("admin.esim.navRestored", "The store's own bar is back"));
                }}
              >
                {t("admin.esim.navRestore", "Use the store's own bar")}
              </Button>
            ) : null}
            <span className="text-xs text-muted-foreground">{t("admin.esim.navCount", "{shown} of {max} shown", { shown, max: MAX_TABS })}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

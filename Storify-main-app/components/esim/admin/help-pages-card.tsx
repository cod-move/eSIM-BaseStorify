"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, FilePlus2, Loader2 } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";

/** The eSIM help pages (WEB-35): whether they exist, and one click to create the missing ones. */
export function HelpPagesCard({
  pages,
  canManage,
}: {
  pages: Array<{ handle: string; title: string; exists: boolean; published: boolean }>;
  canManage: boolean;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const missing = pages.some((page) => !page.exists);

  async function create() {
    setBusy(true);
    try {
      const result = await apiClient.post<{ created: string[] }>("/api/esim/admin/help-pages", {});
      toast.success(t("admin.esim.helpCreated", "{count} help pages created and published", { count: result.created.length }));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{t("admin.esim.helpPages", "Help pages")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("admin.esim.helpPagesHint", "Ready-made pages built from the eSIM blocks; edit them in the page builder and link them from your menus.")}
          </p>
        </div>
        {canManage && missing ? (
          <Button onClick={create} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FilePlus2 className="mr-2 h-4 w-4" />}
            {t("admin.esim.createHelpPages", "Create help pages")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {pages.map((page) => (
          <div key={page.handle} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{page.title}</div>
              <div className="font-mono text-xs text-muted-foreground">/pages/{page.handle}</div>
            </div>
            {page.exists ? (
              <div className="flex items-center gap-3">
                <Badge variant={page.published ? "default" : "secondary"}>
                  {page.published ? t("admin.esim.pagePublished", "Published") : t("admin.esim.pageDraft", "Draft")}
                </Badge>
                <Link href={`/admin/online-store/pages/landing/${page.handle}`} className="text-store-link hover:underline">
                  {t("admin.esim.editPage", "Edit")}
                </Link>
                <a href={`/pages/${page.handle}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-store-link hover:underline">
                  {t("admin.esim.viewPage", "View")} <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <Badge variant="outline">{t("admin.esim.pageMissing", "Not created")}</Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

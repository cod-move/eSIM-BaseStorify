"use client";

import Link from "@/components/language/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/components/ui/toast-notification";
import { ExternalLink, Loader2, Save } from "lucide-react";
import { RichTextEditor } from "@/components/ui/rich-text-editor-lazy";
import { Switch } from "@/components/ui/switch";
import { AdminFormStickyHeader } from "@/components/admin/admin-form-sticky-header";
import { ContentPageEditorSkeleton } from "@/components/admin/online-store/online-store-skeletons";
import {
  CONTENT_PAGE_META,
  normalizeContentPagesSettings,
  type NonFaqContentPageKey,
} from "@/lib/site-config/content-pages-config";
import { isRecord } from "@/lib/utils";
// [esim-patch] P74
import { ContentPageLanguagePicker } from "@/components/esim/admin/content-page-language-picker";
import {
  normalizeContentPageTranslations,
  type ContentPageTranslations,
} from "@/lib/esim/content-pages/translations";

type SettingsResponse = {
  success?: boolean;
  data?: {
    contentPages?: unknown;
  };
};

export function ContentPageEditor({
  locale,
  pageKey,
}: {
  locale: string;
  pageKey: NonFaqContentPageKey;
}) {
  const t = useTranslations("admin.contentPageEditor");
  const pageMeta = CONTENT_PAGE_META[pageKey];
  const pageTitle = t(`pages.${pageKey}.title`);
  const pageDescription = t(`pages.${pageKey}.description`);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [visible, setVisible] = useState(true);
  const [initialTitle, setInitialTitle] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [initialVisible, setInitialVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  // [esim-patch] P74 other languages' versions; "" edits the default version
  const [editLang, setEditLang] = useState("");
  const [translations, setTranslations] = useState<ContentPageTranslations>({});
  const [initialTranslations, setInitialTranslations] = useState("{}");
  const applyTranslations = (value: unknown) => {
    const next = normalizeContentPageTranslations(value);
    setTranslations(next);
    setInitialTranslations(JSON.stringify(next));
  };
  const shownTitle = editLang ? (translations[editLang]?.title ?? "") : title;
  const shownContent = editLang ? (translations[editLang]?.content ?? "") : content;
  const editField = (field: "title" | "content", value: string) => {
    if (!editLang) return field === "title" ? setTitle(value) : setContent(value);
    setTranslations((prev) => ({
      ...prev,
      [editLang]: { title: prev[editLang]?.title ?? "", content: prev[editLang]?.content ?? "", [field]: value },
    }));
  };

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/admin/settings", { method: "GET" });
        const payload = (await response.json()) as SettingsResponse;

        if (
          !response.ok ||
          payload.success !== true ||
          !isRecord(payload.data)
        ) {
          throw new Error(t("toast.loadSettingsFailed"));
        }

        const normalized = normalizeContentPagesSettings(
          payload.data.contentPages,
        );
        setTitle(normalized[pageKey].title);
        setContent(normalized[pageKey].content);
        setVisible(normalized[pageKey].visible);
        setInitialTitle(normalized[pageKey].title);
        setInitialContent(normalized[pageKey].content);
        setInitialVisible(normalized[pageKey].visible);
        applyTranslations(normalized[pageKey].translations); // [esim-patch] P74
      } catch {
        toast.error(t("toast.loadFailed", { title: pageTitle }));
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [pageKey, pageTitle, t]);

  const isDirty = useMemo(
    () =>
      title !== initialTitle ||
      content !== initialContent ||
      visible !== initialVisible ||
      JSON.stringify(translations) !== initialTranslations, // [esim-patch] P74
    [title, initialTitle, content, initialContent, visible, initialVisible, translations, initialTranslations],
  );

  const save = async () => {
    try {
      setIsSaving(true);
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "contentPages",
          data: {
            [pageKey]: {
              title,
              content,
              visible,
              translations, // [esim-patch] P74
            },
          },
        }),
      });

      const payload = (await response.json()) as SettingsResponse;
      if (!response.ok || payload.success !== true || !isRecord(payload.data)) {
        throw new Error(t("toast.saveFailed"));
      }

      const normalized = normalizeContentPagesSettings(
        payload.data.contentPages,
      );
      setTitle(normalized[pageKey].title);
      setContent(normalized[pageKey].content);
      setVisible(normalized[pageKey].visible);
      setInitialTitle(normalized[pageKey].title);
      setInitialContent(normalized[pageKey].content);
      setInitialVisible(normalized[pageKey].visible);
      applyTranslations(normalized[pageKey].translations); // [esim-patch] P74
      toast.success(t("toast.saved", { title: pageTitle }));
    } catch {
      toast.error(t("toast.saveFailedFor", { title: pageTitle }));
    } finally {
      setIsSaving(false);
    }
  };

  const openPreview = () => {
    window.open(
      `/${editLang || locale}${pageMeta.publicPath}`, // [esim-patch] P74 preview the language being edited
      "_blank",
      "noopener,noreferrer",
    );
  };

  // Same placeholder each content page's `loading.tsx` paints.
  if (isLoading) return <ContentPageEditorSkeleton />;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <AdminFormStickyHeader
        className="!mx-0 -mt-2 border-b-0 px-0 shadow-none md:px-0"
        title={pageTitle}
        description={pageDescription}
        actions={
          <>
            <Button asChild type="button" variant="outline" size="sm">
              <Link href="/admin/online-store/pages">{t("actions.backToPages")}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPreview}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t("actions.preview")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("actions.saving")}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t("actions.save")}
                </>
              )}
            </Button>
          </>
        }
      />

      <Card className="rounded-sm border border-border bg-card p-4 shadow-[0_3px_14px_rgba(15,23,42,0.06)] md:p-6">
        <div className="space-y-4">
          {/* [esim-patch] P74 */}
          <ContentPageLanguagePicker
            value={editLang}
            onChange={setEditLang}
            translations={translations}
          />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("fields.pageTitle")}
            </p>
            <Input
              value={shownTitle /* [esim-patch] P74 */}
              onChange={(event) => editField("title", event.target.value)}
              placeholder={pageTitle}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("fields.pageContent")}
            </p>
            <RichTextEditor
              key={editLang || "default" /* [esim-patch] P74 */}
              value={shownContent}
              onChange={(value: string) => editField("content", value)}
              placeholder={t("placeholders.content", { title: pageTitle })}
              className="min-h-[360px]"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {t("fields.visibility")}
            </p>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {t("fields.visibleOnStorefront")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("descriptions.hideUnpublish")}
                </p>
              </div>
              <Switch checked={visible} onCheckedChange={setVisible} />
            </div>
          </div>
        </div>
      </Card>

      {!isDirty && (
        <p className="text-sm text-muted-foreground">
          {t("allChangesSaved")}
        </p>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";

/**
 * Merging a destination into another (lib/esim/catalog/merge.ts): two names a
 * supplier gives the same place. Single countries are merged automatically;
 * this is for the rest. Lists the destinations merged into this one, to undo.
 */

export interface MergeTarget {
  productSlug: string;
  name: string;
  scope: string;
  plans: number;
}

export function EsimDestinationMergeCard({
  productSlug,
  name,
  targets,
  mergedHere,
  canManage,
}: {
  productSlug: string;
  name: string;
  targets: MergeTarget[];
  mergedHere: string[];
  canManage: boolean;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [into, setInto] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return targets.filter((target) => !query || target.name.toLowerCase().includes(query) || target.productSlug.includes(query)).slice(0, 200);
  }, [targets, search]);
  const label = (target: MergeTarget) => `${target.name} · ${target.productSlug.replace(/-esim$/, "")} · ${target.scope} · ${target.plans}`;

  async function send(body: Record<string, string>, done: string) {
    setBusy(body.action === "merge" ? "merge" : body.productSlug);
    try {
      await apiClient.post("/api/esim/admin/destinations/merge", body);
      toast.success(done);
      if (body.action === "merge") router.push(`/admin/esim/destinations/${encodeURIComponent(into)}`);
      else router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  function merge() {
    const target = targets.find((entry) => entry.productSlug === into);
    if (!target) return;
    if (!window.confirm(t("admin.esim.mergeConfirm", "Merge \"{from}\" into \"{into}\"? Its product goes to draft and its address redirects there.", { from: name, into: target.name }))) return;
    void send({ action: "merge", productSlug, into }, t("admin.esim.merged", "Destinations merged"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("admin.esim.mergeTitle", "Merge into another destination")}</CardTitle>
        <CardDescription>
          {t(
            "admin.esim.mergeHint",
            "For two destinations that are the same place under different supplier names. This destination's plans, and any the suppliers add later, are then sold under the one you pick, and this page's address redirects there. Destinations of a single country are merged automatically.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {mergedHere.length ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("admin.esim.mergedHere", "Merged into this destination")}</p>
            <ul className="divide-y rounded-md border">
              {mergedHere.map((from) => (
                <li key={from} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-mono">{from.replace(/-esim$/, "")}</span>
                  {canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void send({ action: "unmerge", productSlug: from }, t("admin.esim.unmerged", "Merge undone. That destination's product stays in draft until you show it again."))}
                    >
                      {busy === from ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                      {t("admin.esim.unmerge", "Undo")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {canManage ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center">
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("admin.esim.mergeSearch", "Search destinations")} />
            <select
              className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
              value={into}
              onChange={(event) => setInto(event.target.value)}
              aria-label={t("admin.esim.mergeInto", "Merge into")}
            >
              <option value="">{t("admin.esim.mergeInto", "Merge into")}…</option>
              {shown.map((target) => (
                <option key={target.productSlug} value={target.productSlug}>
                  {label(target)}
                </option>
              ))}
            </select>
            <Button onClick={merge} disabled={!into || busy !== null}>
              {busy === "merge" ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {t("admin.esim.mergeInto", "Merge into")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

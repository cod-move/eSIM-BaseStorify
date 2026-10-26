"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pin, PinOff } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast-notification";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";

/**
 * A destination's variants and, for each, the supplier plans that can fulfil
 * it (ADM-06). The first is the primary: the variant sells at its price and
 * fulfilment tries it first, the rest in order if it refuses. By default the
 * cheapest leads; pinning puts a chosen plan first and re-publishes.
 */

interface Candidate {
  id: string;
  name: string;
  providerCode: string;
  status: string;
  available: boolean;
  costUsdMinor: number | null;
  retailPriceMinor: number | null;
  manualPrice: boolean;
  marginPercent: number | null;
  perDay: boolean;
}

interface Mapping {
  productSlug: string;
  name: string;
  productId: string | null;
  featured: boolean;
  variants: Array<{ key: string; name: string; priceMinor: number; pinned: string | null; candidates: Candidate[] }>;
}

const usd = (minor: number | null) =>
  minor === null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(minor / 100);

export function EsimMappingAdmin({ mapping, canManage }: { mapping: Mapping; canManage: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function pin(variantKey: string, planId: string | null) {
    setBusy(`${variantKey}:${planId}`);
    try {
      await apiClient.post("/api/esim/admin/destinations/pin", { productSlug: mapping.productSlug, variantKey, planId });
      toast.success(t("admin.esim.pinned", "Saved and re-published"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/admin/esim/destinations" className="text-sm text-muted-foreground hover:underline">
          ← {t("admin.sidebar.esimDestinations", "Destinations")}
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{mapping.productSlug}</h1>
        <p className="text-sm text-muted-foreground">
          {t("admin.esim.mappingHint", "The first plan of each variant is the primary: the variant sells at its price and is bought from it first; the others are tried in order if it refuses. The cheapest leads unless you pin one.")}
        </p>
        <div className="mt-2 flex gap-3 text-sm">
          <Link href={`/admin/esim/plans?destination=${encodeURIComponent(mapping.productSlug)}`} className="text-store-link hover:underline">
            {t("admin.esim.allPlansOfDestination", "All plans of this destination")}
          </Link>
          {mapping.productId ? (
            <Link href={`/admin/products/${mapping.productId}/edit`} className="text-store-link hover:underline">
              {t("admin.esim.editProduct", "Edit images and text")}
            </Link>
          ) : null}
        </div>
      </div>

      {mapping.variants.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("admin.esim.notPublishedYet", "Not published yet: switch plans on and publish the destination from the plan library.")}
          </CardContent>
        </Card>
      ) : (
        mapping.variants.map((variant) => (
          <Card key={variant.key}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                {variant.name} · {usd(variant.priceMinor)}
                {variant.pinned ? <Badge className="ml-2">{t("admin.esim.pinnedBadge", "Pinned")}</Badge> : null}
              </CardTitle>
              {canManage && variant.pinned ? (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => pin(variant.key, null)}>
                  <PinOff className="mr-2 h-4 w-4" /> {t("admin.esim.unpin", "Back to cheapest first")}
                </Button>
              ) : null}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("admin.esim.supplierPlan", "Supplier plan")}</TableHead>
                    <TableHead className="text-right">{t("admin.esim.cost", "Cost")}</TableHead>
                    <TableHead className="text-right">{t("admin.esim.price", "Price")}</TableHead>
                    <TableHead className="text-right">{t("admin.esim.margin", "Margin")}</TableHead>
                    {canManage ? <TableHead /> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variant.candidates.map((candidate, index) => (
                    <TableRow key={candidate.id}>
                      <TableCell>{index === 0 ? <Badge>{t("admin.esim.primary", "Primary")}</Badge> : index + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium">{candidate.providerCode}</div>
                        <div className="text-xs text-muted-foreground">{candidate.name}</div>
                        {!candidate.available ? <Badge variant="destructive">{t("admin.esim.withdrawn", "Withdrawn")}</Badge> : null}
                        {candidate.status !== "active" ? <Badge variant="secondary">{t("admin.esim.disabled", "Off")}</Badge> : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {usd(candidate.costUsdMinor)}
                        {candidate.perDay ? "/d" : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        {usd(candidate.retailPriceMinor)}
                        {candidate.perDay ? "/d" : ""}
                        {candidate.manualPrice ? <div className="text-xs text-amber-600">{t("admin.esim.manual", "by hand")}</div> : null}
                      </TableCell>
                      <TableCell className="text-right">{candidate.marginPercent === null ? "—" : `${candidate.marginPercent.toFixed(1)}%`}</TableCell>
                      {canManage ? (
                        <TableCell className="text-right">
                          {index !== 0 && candidate.status === "active" && candidate.available ? (
                            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => pin(variant.key, candidate.id)}>
                              {busy === `${variant.key}:${candidate.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pin className="mr-2 h-4 w-4" />}
                              {t("admin.esim.makePrimary", "Make primary")}
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

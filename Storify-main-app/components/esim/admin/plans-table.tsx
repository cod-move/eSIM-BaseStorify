"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ban, CheckCircle2, Pencil, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui/data-table/types";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminPlanRow, PlanFilters } from "@/lib/esim/admin/plans";

/**
 * The supplier plan library (ADM-03): filter, compare cost, price and
 * margin, switch plans on and off and publish their destinations — the
 * ticked rows, or everything the filters match.
 */

const money = (minor: number | null, currency = "USD") =>
  minor === null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor / 100);

interface Props {
  rows: AdminPlanRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { total: number; active: number; unavailable: number; unpriced: number; published: number };
  filters: PlanFilters;
  sort: { column: string; direction: "asc" | "desc" };
  providers: Array<{ code: string; name: string }>;
  canManage: boolean;
}

export function EsimPlansTable({ rows, pagination, stats, filters, sort, providers, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { confirm } = useConfirmation();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<AdminPlanRow[]>([]);
  const [search, setSearch] = useState(filters.search ?? "");
  const [pricing, setPricing] = useState<AdminPlanRow | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in updates)) params.delete("page");
    setSelected([]);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const activeFilters: PlanFilters = { ...filters, search: filters.search || undefined };
  const hasFilter = Object.values(activeFilters).some(Boolean);

  async function bulk(action: "activate" | "disable" | "publish" | "kyc-required" | "kyc-not-required" | "kyc-default", target: { ids: string[] } | { filters: PlanFilters }) {
    const count = "ids" in target ? target.ids.length : pagination.total;
    const label =
      action === "activate"
        ? t("admin.esim.confirmActivate", "Switch on {count} plans? They will be priced and can be published.", { count })
        : action === "disable"
          ? t("admin.esim.confirmDisable", "Switch off {count} plans? Their variants leave the store at the next publish.", { count })
          : action === "publish"
            ? t("admin.esim.confirmPublish", "Publish the destinations of {count} plans? New products are created as drafts.", { count })
            : t("admin.esim.confirmKyc", "Change whether {count} plans need identity verification?", { count });
    if (!(await confirm({ title: t("admin.esim.confirm", "Are you sure?"), description: label }))) return;
    try {
      const result = await apiClient.post<Record<string, unknown>>("/api/esim/admin/plans/bulk", { action, ...target });
      if (action === "publish") {
        toast.success(
          result.background
            ? t("admin.esim.publishBackground", "Publishing {count} destinations in the background.", { count: Number(result.destinations) })
            : t("admin.esim.published", "Published {count} destinations.", { count: Number(result.destinations) }),
        );
      } else {
        toast.success(t("admin.esim.changed", "{count} plans changed.", { count: Number(result.changed ?? 0) }));
      }
      setSelected([]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function savePrice(reset: boolean) {
    if (!pricing) return;
    const value = reset ? null : Math.round(Number(priceInput) * 100);
    if (!reset && !(value && value > 0)) {
      toast.error(t("admin.esim.badPrice", "Enter a price above zero."));
      return;
    }
    try {
      await apiClient.patch(`/api/esim/admin/plans/${pricing.id}`, { retailPriceMinor: value });
      toast.success(t("admin.esim.priceSaved", "Price saved. Publish the destination to update the store."));
      setPricing(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  const columns: DataTableColumn<AdminPlanRow>[] = [
    {
      id: "name",
      header: t("admin.esim.plan", "Plan"),
      sortable: true,
      cell: (row) => (
        <div className="min-w-56">
          <div className="font-medium">{row.name}</div>
          <div className="text-xs text-muted-foreground">
            {row.destination}
            {row.scope !== "local" ? ` · ${t("admin.esim.countries", "{count} countries", { count: row.countryCount })}` : ""}
          </div>
        </div>
      ),
    },
    { id: "provider", header: t("admin.esim.supplier", "Supplier"), cell: (row) => row.providerCode },
    {
      id: "allowance",
      header: t("admin.esim.allowance", "Data / days"),
      cell: (row) => (
        <span className="whitespace-nowrap">
          {row.data} · {row.days}d
        </span>
      ),
    },
    {
      id: "cost",
      header: t("admin.esim.cost", "Cost"),
      sortable: true,
      cell: (row) => (
        <div className="whitespace-nowrap text-right">
          <div>
            {money(row.cost.amountMinor, row.cost.currency)}
            {row.cost.perDay ? "/d" : ""}
          </div>
          {row.cost.currency !== "USD" ? <div className="text-xs text-muted-foreground">{money(row.costUsdMinor)}</div> : null}
        </div>
      ),
    },
    {
      id: "price",
      header: t("admin.esim.price", "Price"),
      sortable: true,
      cell: (row) => (
        <div className="whitespace-nowrap text-right">
          {money(row.retailPriceMinor)}
          {row.cost.perDay ? "/d" : ""}
          {row.retailPriceManual ? <div className="text-xs text-amber-600">{t("admin.esim.manual", "by hand")}</div> : null}
        </div>
      ),
    },
    {
      id: "margin",
      header: t("admin.esim.margin", "Margin"),
      sortable: true,
      cell: (row) =>
        row.marginPercent === null ? "—" : (
          <span className={row.marginPercent < 10 ? "text-destructive" : ""}>{row.marginPercent.toFixed(1)}%</span>
        ),
    },
    {
      id: "status",
      header: t("admin.esim.status", "Status"),
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant={row.status === "active" ? "default" : "secondary"}>
            {row.status === "active" ? t("admin.esim.active", "On") : t("admin.esim.disabled", "Off")}
          </Badge>
          {row.published ? <Badge variant="outline">{t("admin.esim.publishedBadge", "In store")}</Badge> : null}
          {!row.available ? <Badge variant="destructive">{t("admin.esim.withdrawn", "Withdrawn")}</Badge> : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable<AdminPlanRow>
        title={t("admin.sidebar.esimPlans", "Plans")}
        data={rows}
        columns={columns}
        keyField="id"
        isLoading={isPending}
        loadingMode="rows"
        tabs={[
          { id: "all", label: t("admin.esim.all", "All"), count: stats.total },
          { id: "active", label: t("admin.esim.active", "On"), count: stats.active },
          { id: "disabled", label: t("admin.esim.disabled", "Off"), count: stats.total - stats.active },
        ]}
        activeTab={filters.status ?? "all"}
        onTabChange={(tab) => navigate({ status: tab })}
        searchable
        searchPlaceholder={t("admin.esim.searchPlans", "Search name, destination or supplier plan id")}
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          navigate({ search: value.trim() || undefined });
        }}
        filters={[
          {
            id: "provider",
            label: t("admin.esim.supplier", "Supplier"),
            type: "select",
            options: providers.map((provider) => ({ label: provider.name, value: provider.code })),
          },
          {
            id: "scope",
            label: t("admin.esim.coverage", "Coverage"),
            type: "select",
            options: [
              { label: t("esim.browse.local", "Countries"), value: "local" },
              { label: t("esim.browse.regional", "Regions"), value: "regional" },
              { label: t("esim.browse.global", "Global"), value: "global" },
            ],
          },
          { id: "country", label: t("admin.esim.country", "Country code"), type: "search", placeholder: "JP" },
          {
            id: "availability",
            label: t("admin.esim.availability", "Supplier offer"),
            type: "select",
            options: [
              { label: t("admin.esim.offered", "Offered"), value: "available" },
              { label: t("admin.esim.withdrawn", "Withdrawn"), value: "unavailable" },
            ],
          },
        ]}
        filterValues={{
          provider: filters.provider ?? "all",
          scope: filters.scope ?? "all",
          country: filters.country ?? "",
          availability: filters.availability ?? "all",
        }}
        onFilterChange={(id, value) => navigate({ [id]: id === "country" ? value.trim().toUpperCase() || undefined : value })}
        toolbarActions={
          canManage && hasFilter
            ? [
                {
                  id: "matching",
                  label: t("admin.esim.allMatching", "All {count} matching", { count: pagination.total }),
                  variant: "outline",
                  items: [
                    { id: "on", label: t("admin.esim.switchOn", "Switch on"), onClick: () => bulk("activate", { filters: activeFilters }) },
                    { id: "off", label: t("admin.esim.switchOff", "Switch off"), onClick: () => bulk("disable", { filters: activeFilters }) },
                    { id: "publish", label: t("admin.esim.publish", "Publish destinations"), onClick: () => bulk("publish", { filters: activeFilters }) },
                  ],
                },
              ]
            : undefined
        }
        selectable={canManage}
        selectedItems={selected}
        onSelectionChange={setSelected}
        bulkActions={
          canManage
            ? [
                { id: "on", label: t("admin.esim.switchOn", "Switch on"), icon: <CheckCircle2 className="h-4 w-4" />, onClick: (items) => bulk("activate", { ids: items.map((item) => item.id) }) },
                { id: "off", label: t("admin.esim.switchOff", "Switch off"), icon: <Ban className="h-4 w-4" />, onClick: (items) => bulk("disable", { ids: items.map((item) => item.id) }) },
                { id: "publish", label: t("admin.esim.publish", "Publish destinations"), icon: <Rocket className="h-4 w-4" />, onClick: (items) => bulk("publish", { ids: items.map((item) => item.id) }) },
                { id: "kyc-on", label: t("admin.esim.kycOn", "Needs KYC"), onClick: (items) => bulk("kyc-required", { ids: items.map((item) => item.id) }) },
                { id: "kyc-off", label: t("admin.esim.kycOff", "No KYC"), onClick: (items) => bulk("kyc-not-required", { ids: items.map((item) => item.id) }) },
                { id: "kyc-default", label: t("admin.esim.kycDefault", "KYC: use defaults"), onClick: (items) => bulk("kyc-default", { ids: items.map((item) => item.id) }) },
              ]
            : undefined
        }
        rowActions={
          canManage
            ? (row) => [
                {
                  id: "price",
                  label: t("admin.esim.setPrice", "Set price"),
                  icon: <Pencil className="h-4 w-4" />,
                  onClick: () => {
                    setPricing(row);
                    setPriceInput(row.retailPriceMinor ? (row.retailPriceMinor / 100).toFixed(2) : "");
                  },
                },
              ]
            : undefined
        }
        pagination={pagination}
        onPageChange={(page) => navigate({ page: String(page) })}
        onPageSizeChange={(size) => navigate({ pageSize: String(size) })}
        sortColumn={sort.column}
        sortDirection={sort.direction}
        onSortChange={(column, direction) => navigate({ sort: column, order: direction })}
        emptyMessage={t("admin.esim.noPlans", "No plans match. Sync a supplier, or change the filters.")}
      />

      <Dialog open={pricing !== null} onOpenChange={(open) => !open && setPricing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.esim.setPrice", "Set price")}</DialogTitle>
          </DialogHeader>
          {pricing ? (
            <div className="space-y-3 text-sm">
              <div className="font-medium">{pricing.name}</div>
              <div className="text-muted-foreground">
                {t("admin.esim.costIs", "Cost {cost} (about {usd}).", { cost: money(pricing.cost.amountMinor, pricing.cost.currency), usd: money(pricing.costUsdMinor) })}
                {pricing.cost.perDay ? ` ${t("admin.esim.perDayNote", "Prices are per day for this plan.")}` : ""}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="esim-price">{t("admin.esim.priceUsd", "Selling price (USD)")}</Label>
                <Input id="esim-price" type="number" min="0.01" step="0.01" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} />
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2">
            {pricing?.retailPriceManual ? (
              <Button variant="outline" onClick={() => savePrice(true)}>
                {t("admin.esim.backToRules", "Use the pricing rules")}
              </Button>
            ) : null}
            <Button onClick={() => savePrice(false)}>{t("admin.esim.save", "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

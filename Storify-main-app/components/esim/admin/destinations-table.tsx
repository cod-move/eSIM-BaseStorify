"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Rocket, Star, StarOff } from "lucide-react";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui/data-table/types";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { AdminDestination, DestinationFilters } from "@/lib/esim/admin/destinations";

/**
 * Destinations (ADM-02): every country, region and global bundle the
 * suppliers offer, with its plans, suppliers and store product; feature,
 * show or hide, switch all plans on or off, publish — one or many at once.
 */

type Action = "feature" | "unfeature" | "show" | "hide" | "plansOn" | "plansOff" | "publish";

interface Props {
  rows: AdminDestination[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filters: DestinationFilters;
  canManage: boolean;
}

export function EsimDestinationsTable({ rows, pagination, filters, canManage }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { confirm } = useConfirmation();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<AdminDestination[]>([]);
  const [search, setSearch] = useState(filters.search ?? "");

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

  async function bulk(action: Action, items: AdminDestination[]) {
    if (["plansOff", "hide", "publish"].includes(action)) {
      const description =
        action === "plansOff"
          ? t("admin.esim.confirmPlansOff", "Switch off every plan of {count} destinations? They leave the store at the next publish.", { count: items.length })
          : action === "hide"
            ? t("admin.esim.confirmHide", "Hide {count} destinations from the store?", { count: items.length })
            : t("admin.esim.confirmPublishDestinations", "Publish {count} destinations? New products are created as drafts.", { count: items.length });
      if (!(await confirm({ title: t("admin.esim.confirm", "Are you sure?"), description }))) return;
    }
    try {
      const result = await apiClient.post<Record<string, unknown>>("/api/esim/admin/destinations/bulk", { action, productSlugs: items.map((item) => item.productSlug) });
      toast.success(
        result.background
          ? t("admin.esim.publishBackground", "Publishing {count} destinations in the background.", { count: items.length })
          : t("admin.esim.saved", "Saved"),
      );
      setSelected([]);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  const productState = (row: AdminDestination) =>
    !row.productStatus ? (
      <Badge variant="outline">{t("admin.esim.notPublished", "Not published")}</Badge>
    ) : row.productStatus === "active" ? (
      <Badge>{t("admin.esim.selling", "Selling")}</Badge>
    ) : (
      <Badge variant="secondary">{t("admin.esim.hidden", "Hidden")}</Badge>
    );

  const columns: DataTableColumn<AdminDestination>[] = [
    {
      id: "name",
      header: t("admin.esim.destination", "Destination"),
      cell: (row) => (
        <div className="min-w-48">
          <Link href={`/admin/esim/destinations/${row.productSlug}`} className="font-medium text-store-link hover:underline">
            {row.featured ? "★ " : ""}
            {row.name}
          </Link>
          <div className="text-xs text-muted-foreground">
            {row.scope === "local" ? row.productSlug : t("admin.esim.countries", "{count} countries", { count: row.countries })}
          </div>
        </div>
      ),
    },
    {
      id: "plans",
      header: t("admin.esim.plansOnOff", "Plans on / all"),
      cell: (row) => (
        <span className={row.activePlans ? "" : "text-muted-foreground"}>
          {row.activePlans} / {row.plans}
        </span>
      ),
    },
    { id: "suppliers", header: t("admin.esim.suppliers", "Suppliers"), cell: (row) => <span className="text-xs">{row.suppliers.join(", ")}</span> },
    { id: "variants", header: t("admin.esim.variantsInStore", "Variants in store"), cell: (row) => row.variants || "—" },
    {
      id: "product",
      header: t("admin.esim.storeProduct", "Store product"),
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          {productState(row)}
          {row.productId ? (
            <Link href={`/admin/products/${row.productId}/edit`} className="text-xs text-store-link hover:underline">
              {t("admin.esim.editProduct", "Edit images and text")}
            </Link>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <DataTable<AdminDestination>
      title={t("admin.sidebar.esimDestinations", "Destinations")}
      data={rows}
      columns={columns}
      keyField="productSlug"
      isLoading={isPending}
      loadingMode="rows"
      tabs={[
        { id: "all", label: t("admin.esim.all", "All") },
        { id: "selling", label: t("admin.esim.selling", "Selling") },
        { id: "hidden", label: t("admin.esim.hidden", "Hidden") },
        { id: "none", label: t("admin.esim.notPublished", "Not published") },
      ]}
      activeTab={filters.state ?? "all"}
      onTabChange={(tab) => navigate({ state: tab })}
      searchable
      searchPlaceholder={t("admin.esim.searchDestinations", "Country, region or a covered country")}
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value);
        navigate({ search: value.trim() || undefined });
      }}
      filters={[
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
        {
          id: "featured",
          label: t("admin.esim.featured", "Featured"),
          type: "select",
          options: [{ label: t("admin.esim.featuredOnly", "Featured only"), value: "1" }],
        },
      ]}
      filterValues={{ scope: filters.scope ?? "all", featured: filters.featured ? "1" : "all" }}
      onFilterChange={(id, value) => navigate({ [id]: value })}
      selectable={canManage}
      selectedItems={selected}
      onSelectionChange={setSelected}
      bulkActions={
        canManage
          ? [
              { id: "plansOn", label: t("admin.esim.allPlansOn", "Switch all plans on"), onClick: (items) => bulk("plansOn", items) },
              { id: "publish", label: t("admin.esim.publish", "Publish destinations"), icon: <Rocket className="h-4 w-4" />, onClick: (items) => bulk("publish", items) },
              { id: "show", label: t("admin.esim.show", "Show in store"), icon: <Eye className="h-4 w-4" />, onClick: (items) => bulk("show", items) },
              { id: "hide", label: t("admin.esim.hide", "Hide from store"), icon: <EyeOff className="h-4 w-4" />, onClick: (items) => bulk("hide", items) },
              { id: "feature", label: t("admin.esim.feature", "Feature"), icon: <Star className="h-4 w-4" />, onClick: (items) => bulk("feature", items) },
              { id: "unfeature", label: t("admin.esim.unfeature", "Unfeature"), icon: <StarOff className="h-4 w-4" />, onClick: (items) => bulk("unfeature", items) },
              { id: "plansOff", label: t("admin.esim.allPlansOff", "Switch all plans off"), variant: "destructive", onClick: (items) => bulk("plansOff", items) },
            ]
          : undefined
      }
      pagination={pagination}
      onPageChange={(page) => navigate({ page: String(page) })}
      onPageSizeChange={(size) => navigate({ pageSize: String(size) })}
      emptyMessage={t("admin.esim.noDestinations", "No destinations match.")}
    />
  );
}

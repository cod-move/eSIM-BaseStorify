"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "@/components/language/link";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui/data-table/types";
import { EsimStatusBadge } from "@/components/esim/esim-status-badge";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { formatBytes } from "@/lib/esim/account/display";
import type { Display } from "@/lib/esim/account/display";
import type { AdminEsimRow } from "@/lib/esim/admin/esims";

/** Every issued eSIM, searchable by ICCID, order number or email (ADM-07). */
export function EsimsTable({
  rows,
  pagination,
  filters,
  providers,
}: {
  rows: AdminEsimRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filters: { search?: string; provider?: string; lifecycle?: string };
  providers: Array<{ code: string; name: string }>;
}) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search ?? "");
  const date = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "—");

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const columns: DataTableColumn<AdminEsimRow>[] = [
    {
      id: "iccid",
      header: "ICCID",
      cell: (row) => (
        <Link href={`/admin/esim/esims/${row.id}`} className="font-mono text-xs text-store-link hover:underline">
          {row.iccid ?? "—"}
        </Link>
      ),
    },
    {
      id: "order",
      header: t("admin.esim.order", "Order"),
      // Carried over from the old store: no order here to open.
      cell: (row) =>
        row.orderNumber.startsWith("LEGACY-") ? (
          row.orderNumber
        ) : (
          <Link href={`/admin/orders/${row.orderId}`} className="hover:underline">
            {row.orderNumber}
          </Link>
        ),
    },
    { id: "customer", header: t("admin.esim.customer", "Customer"), cell: (row) =>
        row.customer && row.customerId ? (
          <Link href={`/admin/customers/${row.customerId}`} className="text-store-link hover:underline">
            {row.customer}
          </Link>
        ) : (
          row.customer ?? "—"
        ),
    },
    {
      id: "plan",
      header: t("admin.esim.plan", "Plan"),
      cell: (row) => (
        <div>
          <div>{row.plan}</div>
          <div className="text-xs text-muted-foreground">{row.providerCode}</div>
        </div>
      ),
    },
    {
      id: "status",
      header: t("admin.esim.status", "Status"),
      cell: (row) => (
        <EsimStatusBadge display={{ status: row.status, tone: row.tone } as Display} label={t(`esim.status.${row.status}`, row.statusLabel)} />
      ),
    },
    {
      id: "usage",
      header: t("admin.esim.dataLeft", "Data left"),
      cell: (row) => (row.totalBytes ? `${formatBytes(row.remainingBytes)} / ${formatBytes(row.totalBytes)}` : "—"),
    },
    { id: "fulfilledAt", header: t("admin.esim.issued", "Issued"), cell: (row) => date(row.fulfilledAt) },
    { id: "expiresAt", header: t("admin.esim.expires", "Expires"), cell: (row) => date(row.expiresAt) },
  ];

  return (
    <DataTable<AdminEsimRow>
      title={t("admin.sidebar.esimEsims", "eSIMs")}
      data={rows}
      columns={columns}
      keyField="id"
      isLoading={isPending}
      loadingMode="rows"
      searchable
      searchPlaceholder={t("admin.esim.searchEsims", "ICCID, order number or email")}
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
          id: "lifecycle",
          label: t("admin.esim.lifecycle", "Use"),
          type: "select",
          options: ["not_installed", "installed", "in_use", "depleted", "expired", "cancelled"].map((value) => ({
            label: t(`admin.esim.lifecycle_${value}`, value.replace("_", " ")),
            value,
          })),
        },
      ]}
      filterValues={{ provider: filters.provider ?? "all", lifecycle: filters.lifecycle ?? "all" }}
      onFilterChange={(id, value) => navigate({ [id]: value })}
      pagination={pagination}
      onPageChange={(page) => navigate({ page: String(page) })}
      onPageSizeChange={(size) => navigate({ pageSize: String(size) })}
      onRowClick={(row) => router.push(`/admin/esim/esims/${row.id}`)}
      emptyMessage={t("admin.esim.noEsims", "No eSIMs match.")}
    />
  );
}

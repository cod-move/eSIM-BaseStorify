"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "@/components/language/link";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui/data-table/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast-notification";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { LogFilters } from "@/lib/esim/admin/logs";

/** Every call to a supplier, redacted, findable by order number or ICCID (ADM-09). */

interface LogRow {
  id: string;
  providerCode: string;
  operation: string;
  ok: boolean;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
  orderId: string | null;
  esimId: string | null;
  createdAt: string;
}

interface Props {
  rows: LogRow[];
  operations: string[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filters: LogFilters;
  providers: Array<{ code: string; name: string }>;
}

export function EsimLogsTable({ rows, operations, pagination, filters, providers }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search ?? "");
  const [open, setOpen] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  async function show(row: LogRow) {
    setLoading(row.id);
    try {
      setOpen(await apiClient.get<Record<string, unknown>>(`/api/esim/admin/logs/${row.id}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(null);
    }
  }

  const columns: DataTableColumn<LogRow>[] = [
    { id: "createdAt", header: t("admin.esim.time", "Time"), cell: (row) => <span className="whitespace-nowrap text-xs">{new Date(row.createdAt).toLocaleString()}</span> },
    { id: "provider", header: t("admin.esim.supplier", "Supplier"), cell: (row) => row.providerCode },
    { id: "operation", header: t("admin.esim.operation", "Call"), cell: (row) => <span className="font-mono text-xs">{row.operation}</span> },
    {
      id: "ok",
      header: t("admin.esim.result", "Result"),
      cell: (row) =>
        row.ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <span className="flex items-start gap-1 text-destructive">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-xs">
              {row.errorCode ? `${row.errorCode}: ` : ""}
              {row.errorMessage}
            </span>
          </span>
        ),
    },
    { id: "duration", header: "ms", cell: (row) => row.durationMs },
    {
      id: "refs",
      header: t("admin.esim.refs", "For"),
      cell: (row) => (
        <span className="text-xs">
          {row.esimId ? <Link href={`/admin/esim/esims/${row.esimId}`} className="text-store-link hover:underline">eSIM</Link> : null}
          {row.esimId && row.orderId ? " · " : null}
          {row.orderId ? <Link href={`/admin/orders/${row.orderId}`} className="text-store-link hover:underline">{t("admin.esim.order", "Order")}</Link> : null}
        </span>
      ),
    },
    { id: "open", header: "", cell: (row) => (loading === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null) },
  ];

  return (
    <>
      <DataTable<LogRow>
        title={t("admin.sidebar.esimLogs", "Supplier calls")}
        data={rows}
        columns={columns}
        keyField="id"
        isLoading={isPending}
        loadingMode="rows"
        searchable
        searchPlaceholder={t("admin.esim.searchLogs", "Order number or ICCID")}
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          navigate({ search: value.trim() || undefined });
        }}
        filters={[
          { id: "provider", label: t("admin.esim.supplier", "Supplier"), type: "select", options: providers.map((provider) => ({ label: provider.name, value: provider.code })) },
          { id: "operation", label: t("admin.esim.operation", "Call"), type: "select", options: operations.map((operation) => ({ label: operation, value: operation })) },
          {
            id: "outcome",
            label: t("admin.esim.result", "Result"),
            type: "select",
            options: [
              { label: t("admin.esim.succeeded", "Succeeded"), value: "ok" },
              { label: t("admin.esim.failed", "Failed"), value: "error" },
            ],
          },
        ]}
        filterValues={{ provider: filters.provider ?? "all", operation: filters.operation ?? "all", outcome: filters.outcome ?? "all" }}
        onFilterChange={(id, value) => navigate({ [id]: value })}
        pagination={pagination}
        onPageChange={(page) => navigate({ page: String(page) })}
        onPageSizeChange={(size) => navigate({ pageSize: String(size) })}
        onRowClick={show}
        emptyMessage={t("admin.esim.noLogs", "No supplier calls match.")}
      />
      <Dialog open={open !== null} onOpenChange={(value) => !value && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {String(open?.providerCode ?? "")} · {String(open?.operation ?? "")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <p className="text-muted-foreground">{t("admin.esim.redacted", "Keys, passwords and activation codes are removed before a call is stored.")}</p>
            {(["request", "response"] as const).map((part) => (
              <div key={part} className="space-y-1">
                <div className="font-medium">{part === "request" ? t("admin.esim.request", "Request") : t("admin.esim.response", "Response")}</div>
                <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3">{JSON.stringify(open?.[part] ?? null, null, 2)}</pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

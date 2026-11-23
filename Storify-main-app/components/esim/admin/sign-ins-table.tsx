"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "@/components/language/link";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui/data-table/types";
import { usePathname, useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { deviceOf } from "@/lib/esim/account/device-name";
import type { AdminSignInRow, SignInFilters } from "@/lib/esim/admin/sign-ins";

interface Props {
  rows: AdminSignInRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  filters: SignInFilters;
  methods: readonly string[];
  clients: readonly string[];
}

/** Admin → eSIM → Sign-ins: every account's sign-ins, newest first (patch P61's log). */
export function EsimSignInsTable({ rows, pagination, filters, methods, clients }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.search ?? "");

  const navigate = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    if (!("page" in updates)) params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  };

  const methodLabel = (method: string) => t(`admin.esim.signInMethod_${method}`, method);
  const clientLabel = (client: string) => t(`admin.esim.signInClient_${client}`, client);

  const columns: DataTableColumn<AdminSignInRow>[] = [
    {
      id: "at",
      header: t("admin.esim.signInTime", "Time"),
      cell: (row) => <span className="whitespace-nowrap text-xs">{new Date(row.at).toLocaleString()}</span>,
    },
    {
      id: "account",
      header: t("admin.esim.signInAccount", "Account"),
      cell: (row) => {
        const label = row.email ?? row.userId;
        return (
          <div className="min-w-0">
            {row.customerId ? (
              <Link href={`/admin/customers/${row.customerId}`} className="text-store-link hover:underline">
                {label}
              </Link>
            ) : (
              <span>{label}</span>
            )}
            {row.name ? <div className="text-xs text-muted-foreground">{row.name}</div> : null}
          </div>
        );
      },
    },
    {
      id: "method",
      header: t("admin.esim.signInMethod", "How"),
      cell: (row) => (
        <div>
          {methodLabel(row.method)}
          {row.impersonatedBy ? (
            <div className="text-xs text-muted-foreground">
              {t("admin.esim.signInBy", "Signed in by admin")}: {row.impersonatedBy}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "client",
      header: t("admin.esim.signInClient", "Where"),
      cell: (row) => (row.client ? clientLabel(row.client) : "—"),
    },
    {
      id: "ip",
      header: t("admin.esim.signInIp", "IP address"),
      cell: (row) =>
        row.ip ? (
          <button
            type="button"
            className="font-mono text-xs hover:underline"
            title={t("admin.esim.signInsSameIp", "Show sign-ins from this IP")}
            onClick={() => {
              setSearch(row.ip ?? "");
              navigate({ search: row.ip ?? undefined });
            }}
          >
            {row.ip}
          </button>
        ) : (
          "—"
        ),
    },
    {
      id: "device",
      header: t("admin.esim.signInDevice", "Device"),
      cell: (row) => <span title={row.userAgent ?? undefined}>{deviceOf(row.userAgent)}</span>,
    },
  ];

  return (
    <DataTable<AdminSignInRow>
      title={t("admin.sidebar.esimSignIns", "Sign-in log")}
      data={rows}
      columns={columns}
      keyField="id"
      isLoading={isPending}
      loadingMode="rows"
      searchable
      searchPlaceholder={t("admin.esim.searchSignIns", "Email, name or IP address")}
      searchValue={search}
      onSearchChange={(value) => {
        setSearch(value);
        navigate({ search: value.trim() || undefined });
      }}
      filters={[
        {
          id: "method",
          label: t("admin.esim.signInMethod", "How"),
          type: "select",
          options: methods.map((method) => ({ label: methodLabel(method), value: method })),
        },
        {
          id: "client",
          label: t("admin.esim.signInClient", "Where"),
          type: "select",
          options: clients.map((client) => ({ label: clientLabel(client), value: client })),
        },
      ]}
      filterValues={{ method: filters.method ?? "all", client: filters.client ?? "all" }}
      onFilterChange={(id, value) => navigate({ [id]: value })}
      pagination={pagination}
      onPageChange={(page) => navigate({ page: String(page) })}
      onPageSizeChange={(size) => navigate({ pageSize: String(size) })}
      emptyMessage={t("admin.esim.noSignIns", "No sign-ins recorded yet.")}
    />
  );
}

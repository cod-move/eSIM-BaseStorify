"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui/data-table/types";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import type { SignInRow } from "@/lib/esim/account/sign-ins";

interface Page {
  rows: SignInRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** A short device name from a user agent: browser and system, or the app. */
function deviceOf(agent: string | null): string {
  if (!agent) return "—";
  const os = /iPhone|iPad/.test(agent)
    ? "iOS"
    : /Android/.test(agent)
      ? "Android"
      : /Windows/.test(agent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(agent)
          ? "macOS"
          : /Linux/.test(agent)
            ? "Linux"
            : null;
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\//.test(agent)
      ? "Opera"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Firefox\//.test(agent)
          ? "Firefox"
          : /Safari\//.test(agent)
            ? "Safari"
            : /okhttp|Expo|CFNetwork|Dalvik/i.test(agent)
              ? "App"
              : null;
  return [browser, os].filter(Boolean).join(" · ") || agent.slice(0, 40);
}

/**
 * The Sign-ins tab of the admin customer page (patch P61): when, how and
 * from where the account signed in, kept 180 days. The full user agent is
 * in the device cell's tooltip.
 */
export function CustomerSignInsTab({ customerId }: { customerId: string }) {
  const t = useFallbackTranslator(useTranslations());
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .get<Page>(
        `/api/esim/admin/customers/${customerId}/sign-ins?page=${page}`,
      )
      .then((result) => {
        if (!active) return;
        setData(result);
        setFailed(false);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId, page]);

  if (failed) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        {t("admin.esim.signInsFailed", "The sign-ins could not be loaded.")}
      </p>
    );
  }

  const columns: DataTableColumn<SignInRow>[] = [
    {
      id: "at",
      header: t("admin.esim.signInTime", "Time"),
      cell: (row) => new Date(row.at).toLocaleString(),
    },
    {
      id: "method",
      header: t("admin.esim.signInMethod", "How"),
      cell: (row) => t(`admin.esim.signInMethod_${row.method}`, row.method),
    },
    {
      id: "client",
      header: t("admin.esim.signInClient", "Where"),
      cell: (row) =>
        row.client
          ? t(`admin.esim.signInClient_${row.client}`, row.client)
          : "—",
    },
    {
      id: "ip",
      header: t("admin.esim.signInIp", "IP address"),
      cell: (row) => <span className="font-mono text-xs">{row.ip ?? "—"}</span>,
    },
    {
      id: "device",
      header: t("admin.esim.signInDevice", "Device"),
      cell: (row) => (
        <span title={row.userAgent ?? undefined}>
          {deviceOf(row.userAgent)}
        </span>
      ),
    },
  ];

  return (
    <DataTable<SignInRow>
      title={t("admin.esim.signIns", "Sign-ins")}
      data={data?.rows ?? []}
      columns={columns}
      keyField="id"
      isLoading={loading}
      loadingMode="rows"
      pagination={data?.pagination}
      onPageChange={(next) => {
        setLoading(true);
        setPage(next);
      }}
      emptyMessage={t("admin.esim.noSignIns", "No sign-ins recorded yet.")}
    />
  );
}

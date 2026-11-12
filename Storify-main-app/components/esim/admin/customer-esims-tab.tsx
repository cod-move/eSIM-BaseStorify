"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "@/components/language/link";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui/data-table/types";
import { EsimStatusBadge } from "@/components/esim/esim-status-badge";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { apiClient } from "@/lib/api/client";
import { formatBytes } from "@/lib/esim/account/display";
import type { Display } from "@/lib/esim/account/display";
import type { AdminEsimRow } from "@/lib/esim/admin/esims";

interface NumberRow {
  id: string;
  msisdn: string;
  iccid: string;
  providerCode: string;
  status: string;
  soldAt: string | null;
  balanceMinor: number | null;
  currency: string | null;
  blocked: boolean | null;
  lastUsedAt: string | null;
}

interface Page {
  rows: AdminEsimRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  numbers: NumberRow[];
}

/**
 * The eSIM tab of the admin customer page (patch P59): the customer's eSIMs,
 * migrated ones included, each opening its eSIM page. Read through the eSIM
 * admin API, so a team member without eSIM access sees a short notice.
 */
export function CustomerEsimsTab({ customerId }: { customerId: string }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleDateString() : "—";

  useEffect(() => {
    let active = true;
    apiClient
      .get<Page>(
        `/api/esim/admin/customers/${customerId}/esims?page=${page}&pageSize=10`,
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
        {t(
          "admin.esim.customerEsimsFailed",
          "The eSIMs could not be loaded (no eSIM access, or try again).",
        )}
      </p>
    );
  }

  const columns: DataTableColumn<AdminEsimRow>[] = [
    {
      id: "iccid",
      header: "ICCID",
      cell: (row) => (
        <span className="font-mono text-xs">{row.iccid ?? "—"}</span>
      ),
    },
    {
      id: "plan",
      header: t("admin.esim.plan", "Plan"),
      cell: (row) => (
        <div>
          <div>{row.plan}</div>
          <div className="text-xs text-muted-foreground">
            {row.providerCode}
          </div>
        </div>
      ),
    },
    {
      id: "order",
      header: t("admin.esim.order", "Order"),
      cell: (row) =>
        row.orderNumber.startsWith("LEGACY-") ? (
          row.orderNumber
        ) : (
          <Link
            href={`/admin/orders/${row.orderId}`}
            className="hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.orderNumber}
          </Link>
        ),
    },
    {
      id: "status",
      header: t("admin.esim.status", "Status"),
      cell: (row) => (
        <EsimStatusBadge
          display={{ status: row.status, tone: row.tone } as Display}
          label={t(`esim.status.${row.status}`, row.statusLabel)}
        />
      ),
    },
    {
      id: "usage",
      header: t("admin.esim.dataLeft", "Data left"),
      cell: (row) =>
        row.totalBytes
          ? `${formatBytes(row.remainingBytes)} / ${formatBytes(row.totalBytes)}`
          : "—",
    },
    {
      id: "expiresAt",
      header: t("admin.esim.expires", "Expires"),
      cell: (row) => date(row.expiresAt),
    },
  ];

  const numberColumns: DataTableColumn<NumberRow>[] = [
    {
      id: "msisdn",
      header: t("admin.esim.number", "Number"),
      cell: (row) => <span className="font-mono">{row.msisdn}</span>,
    },
    {
      id: "iccid",
      header: "ICCID",
      cell: (row) => <span className="font-mono text-xs">{row.iccid}</span>,
    },
    {
      id: "status",
      header: t("admin.esim.status", "Status"),
      cell: (row) => (
        <div>
          <div>{t(`admin.esim.numberStatus_${row.status}`, row.status)}</div>
          {row.blocked ? (
            <div className="text-xs text-destructive">
              {t("admin.esim.numberBlocked", "Blocked")}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      id: "balance",
      header: t("admin.esim.numberBalance", "Card balance"),
      cell: (row) =>
        row.balanceMinor === null
          ? "—"
          : `${(row.balanceMinor / 100).toFixed(2)} ${row.currency ?? ""}`.trim(),
    },
    {
      id: "lastUsedAt",
      header: t("admin.esim.numberLastUsed", "Last used"),
      cell: (row) => date(row.lastUsedAt),
    },
    {
      id: "soldAt",
      header: t("admin.esim.numberSoldAt", "Bought"),
      cell: (row) => date(row.soldAt),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable<AdminEsimRow>
        title={t("admin.sidebar.esimEsims", "eSIMs")}
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
        onRowClick={(row) => router.push(`/admin/esim/esims/${row.id}`)}
        emptyMessage={t(
          "admin.esim.customerNoEsims",
          "This customer has no eSIMs.",
        )}
      />
      <DataTable<NumberRow>
        title={t("admin.esim.customerNumbers", "Number cards")}
        data={data?.numbers ?? []}
        columns={numberColumns}
        keyField="id"
        isLoading={loading && !data}
        loadingMode="rows"
        onRowClick={(row) =>
          router.push(
            `/admin/esim/numbers?search=${encodeURIComponent(row.msisdn)}`,
          )
        }
        emptyMessage={t(
          "admin.esim.customerNoNumbers",
          "This customer has no number cards.",
        )}
      />
    </div>
  );
}

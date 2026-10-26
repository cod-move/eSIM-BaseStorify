import { setRequestLocale } from "next-intl/server";
import { listLogs, type LogFilters } from "@/lib/esim/admin/logs";
import { listAdminProviders } from "@/lib/esim/admin/providers";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimLogsTable } from "@/components/esim/admin/logs-table";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** Admin → eSIM → Supplier calls (ADM-09). */
export default async function AdminEsimLogsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await esimPageAccess(locale);
  const search = await searchParams;
  const filters: LogFilters = {
    provider: one(search.provider),
    operation: one(search.operation),
    outcome: one(search.outcome) as LogFilters["outcome"],
    search: one(search.search),
  };
  const [list, providers] = await Promise.all([
    listLogs(filters, { page: Number(one(search.page)) || 1, pageSize: Number(one(search.pageSize)) || 50 }),
    listAdminProviders(),
  ]);
  return (
    <EsimLogsTable
      rows={list.rows}
      operations={list.operations}
      pagination={list.pagination}
      filters={filters}
      providers={providers.map((provider) => ({ code: provider.code, name: provider.name }))}
    />
  );
}

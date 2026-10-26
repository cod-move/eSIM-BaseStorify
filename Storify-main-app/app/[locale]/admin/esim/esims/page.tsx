import { setRequestLocale } from "next-intl/server";
import { listAdminEsims } from "@/lib/esim/admin/esims";
import { listAdminProviders } from "@/lib/esim/admin/providers";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimsTable } from "@/components/esim/admin/esims-table";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** Admin → eSIM → eSIMs (ADM-07). The query string is the table's state. */
export default async function AdminEsimsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await esimPageAccess(locale);
  const search = await searchParams;
  const filters = { search: one(search.search), provider: one(search.provider), lifecycle: one(search.lifecycle) };
  const [list, providers] = await Promise.all([
    listAdminEsims(filters, { page: Number(one(search.page)) || 1, pageSize: Number(one(search.pageSize)) || 25 }),
    listAdminProviders(),
  ]);
  return (
    <EsimsTable
      rows={list.rows}
      pagination={list.pagination}
      filters={filters}
      providers={providers.map((provider) => ({ code: provider.code, name: provider.name }))}
    />
  );
}

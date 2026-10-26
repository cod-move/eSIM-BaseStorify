import { setRequestLocale } from "next-intl/server";
import { listDestinationsAdmin, type DestinationFilters } from "@/lib/esim/admin/destinations";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimDestinationsTable } from "@/components/esim/admin/destinations-table";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** Admin → eSIM → Destinations (ADM-02). */
export default async function AdminEsimDestinationsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const filters: DestinationFilters = {
    search: one(search.search),
    scope: one(search.scope) as DestinationFilters["scope"],
    state: one(search.state) as DestinationFilters["state"],
    featured: one(search.featured) === "1",
  };
  const list = await listDestinationsAdmin(filters, { page: Number(one(search.page)) || 1, pageSize: Number(one(search.pageSize)) || 50 });
  return <EsimDestinationsTable rows={list.rows} pagination={list.pagination} filters={filters} canManage={canManage} />;
}

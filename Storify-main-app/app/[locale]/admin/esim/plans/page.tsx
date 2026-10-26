import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { listAdminPlans, planStats, type PlanFilters, type PlanSort } from "@/lib/esim/admin/plans";
import { listAdminProviders } from "@/lib/esim/admin/providers";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimPlansTable } from "@/components/esim/admin/plans-table";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/**
 * Admin → eSIM → Plans (ADM-03). The query string is the table's whole state:
 * every filter, sort and page is a navigation that re-reads the plans here.
 */
export default async function AdminEsimPlansPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const filters: PlanFilters = {
    provider: one(search.provider),
    scope: one(search.scope) as PlanFilters["scope"],
    country: one(search.country),
    status: one(search.status) as PlanFilters["status"],
    availability: one(search.availability) as PlanFilters["availability"],
    search: one(search.search),
    productSlug: one(search.destination),
  };
  await connectDB();
  const [list, stats, providers] = await Promise.all([
    listAdminPlans(filters, {
      page: Number(one(search.page)) || 1,
      pageSize: Number(one(search.pageSize)) || 50,
      sort: (one(search.sort) as PlanSort) || "name",
      order: one(search.order) === "desc" ? "desc" : "asc",
    }),
    planStats(),
    listAdminProviders(),
  ]);
  return (
    <EsimPlansTable
      rows={list.rows}
      pagination={list.pagination}
      stats={stats}
      filters={filters}
      sort={{ column: one(search.sort) || "name", direction: one(search.order) === "desc" ? "desc" : "asc" }}
      providers={providers.map((provider) => ({ code: provider.code, name: provider.name }))}
      canManage={canManage}
    />
  );
}

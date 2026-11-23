import { setRequestLocale } from "next-intl/server";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { SIGN_IN_CLIENTS, SIGN_IN_METHODS, listAllSignIns, type SignInFilters } from "@/lib/esim/admin/sign-ins";
import { EsimSignInsTable } from "@/components/esim/admin/sign-ins-table";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** Admin → eSIM → Sign-in log: every account's sign-ins, findable by email, name or IP. */
export default async function AdminEsimSignInsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await esimPageAccess(locale);
  const search = await searchParams;
  const filters: SignInFilters = {
    method: one(search.method),
    client: one(search.client),
    search: one(search.search),
  };
  const list = await listAllSignIns(filters, {
    page: Number(one(search.page)) || 1,
    pageSize: Number(one(search.pageSize)) || 50,
  });
  return (
    <EsimSignInsTable
      rows={list.rows}
      pagination={list.pagination}
      filters={filters}
      methods={SIGN_IN_METHODS}
      clients={SIGN_IN_CLIENTS}
    />
  );
}

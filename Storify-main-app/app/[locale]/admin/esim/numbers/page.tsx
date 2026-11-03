import { setRequestLocale } from "next-intl/server";
import { listNumbersAdmin, type AdminNumberFilters } from "@/lib/esim/admin/numbers";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimNumbersAdmin } from "@/components/esim/admin/numbers-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const STATUSES = ["all", "available", "reserved", "sold", "retired"] as const;

/** Admin → eSIM → Numbers (NUM-01): the number-card stock. */
export default async function AdminEsimNumbersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const query = await searchParams;
  const status = one(query.status);
  const filters: AdminNumberFilters = {
    status: STATUSES.find((entry) => entry === status) ?? "all",
    dialCode: one(query.dialCode),
    search: one(query.search),
    page: Number(one(query.page)) || 1,
  };
  const list = await listNumbersAdmin(filters);
  return <EsimNumbersAdmin list={list} filters={filters} canManage={canManage} />;
}

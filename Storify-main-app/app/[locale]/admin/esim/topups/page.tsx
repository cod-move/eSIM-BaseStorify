import { setRequestLocale } from "next-intl/server";
import { listTopupsAdmin, type TopupView } from "@/lib/esim/admin/topups";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimTopupsAdmin } from "@/components/esim/admin/topups-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const VIEWS: TopupView[] = ["attention", "failed", "stuck", "completed", "all"];

/** Admin → eSIM → Top-ups (TOP-06): every top-up, and the ones that need a person. */
export default async function AdminEsimTopupsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const view = VIEWS.includes(one(search.view) as TopupView) ? (one(search.view) as TopupView) : "attention";
  const filters = {
    search: one(search.search),
    provider: one(search.provider),
    from: one(search.from),
    to: one(search.to),
  };
  const list = await listTopupsAdmin(view, { ...filters, page: Number(one(search.page)) || 1 });
  return <EsimTopupsAdmin view={view} list={list} canManage={canManage} filters={filters} />;
}

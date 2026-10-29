import { setRequestLocale } from "next-intl/server";
import { esimReport } from "@/lib/esim/reports/service";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimReportsAdmin } from "@/components/esim/admin/reports-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** Admin → eSIM → Reports (ADM-17): sales, margin and fulfilment for a date range. */
export default async function AdminEsimReportsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  await esimPageAccess(locale);
  const search = await searchParams;
  const report = await esimReport({ from: one(search.from), to: one(search.to) });
  return <EsimReportsAdmin report={report} />;
}

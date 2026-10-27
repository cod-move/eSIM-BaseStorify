import { setRequestLocale } from "next-intl/server";
import { listAdminPaymentMethods, listAdminPayments } from "@/lib/esim/admin/payments";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimPaymentsAdmin } from "@/components/esim/admin/payments-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Admin → eSIM → Payments (PAY, patch P15): the methods behind "extension", and the payments. */
export default async function AdminEsimPaymentsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const attention = (Array.isArray(search.view) ? search.view[0] : search.view) !== "all";
  const [methods, payments] = await Promise.all([listAdminPaymentMethods(), listAdminPayments({ attention })]);
  return <EsimPaymentsAdmin methods={methods} payments={payments} attention={attention} canManage={canManage} />;
}

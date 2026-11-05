import { setRequestLocale } from "next-intl/server";
import { listAdminPaymentMethods, listAdminPayments } from "@/lib/esim/admin/payments";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimPaymentsAdmin } from "@/components/esim/admin/payments-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Admin → eSIM → Payments (PAY, patch P15): the payments made with the eSIM
 * gateways. The gateways themselves, how checkout lists the methods and the
 * payment fees are on Storify's payment settings page (patch P34).
 */
export default async function AdminEsimPaymentsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const attention = (Array.isArray(search.view) ? search.view[0] : search.view) !== "all";
  const [methods, payments] = await Promise.all([listAdminPaymentMethods(), listAdminPayments({ attention })]);
  return <EsimPaymentsAdmin methods={methods} payments={payments} attention={attention} canManage={canManage} />;
}

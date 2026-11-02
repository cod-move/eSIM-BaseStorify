import { setRequestLocale } from "next-intl/server";
import { listAdminPaymentMethods, listAdminPayments } from "@/lib/esim/admin/payments";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimPaymentsAdmin } from "@/components/esim/admin/payments-admin";
import { getPaymentFees } from "@/lib/esim/admin/payment-fees";
import { EsimPaymentFeesCard } from "@/components/esim/admin/payment-fees-card";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Admin → eSIM → Payments (PAY, patch P15): the methods behind "extension", the payments, and each method's fee (patch P29). */
export default async function AdminEsimPaymentsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const attention = (Array.isArray(search.view) ? search.view[0] : search.view) !== "all";
  const [methods, payments, fees] = await Promise.all([listAdminPaymentMethods(), listAdminPayments({ attention }), getPaymentFees()]);
  return (
    <div className="space-y-6">
      <EsimPaymentsAdmin methods={methods} payments={payments} attention={attention} canManage={canManage} />
      <EsimPaymentFeesCard fees={fees} canManage={canManage} />
    </div>
  );
}

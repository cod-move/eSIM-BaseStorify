import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getAdminEsim } from "@/lib/esim/admin/esims";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimAdminDetail } from "@/components/esim/admin/esim-detail";

/** One eSIM for an admin (ADM-07): status, usage, history, supplier calls, actions. */
export default async function AdminEsimDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const detail = await getAdminEsim(id);
  if (!detail) notFound();
  return <EsimAdminDetail detail={detail} canManage={canManage} />;
}

import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { listAdminProviders } from "@/lib/esim/admin/providers";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimProvidersAdmin } from "@/components/esim/admin/providers-admin";

/** Admin → eSIM → Suppliers (ADM-01). */
export default async function AdminEsimProvidersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  await connectDB();
  return <EsimProvidersAdmin providers={await listAdminProviders()} canManage={canManage} />;
}

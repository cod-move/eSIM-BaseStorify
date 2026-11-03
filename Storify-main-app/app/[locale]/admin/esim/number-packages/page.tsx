import { setRequestLocale } from "next-intl/server";
import { listNumberPackagesAdmin } from "@/lib/esim/admin/number-packages";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimNumberPackagesAdmin } from "@/components/esim/admin/number-packages-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** Admin → eSIM → Number data packages (NUM-02): what a number owner can buy data from. */
export default async function AdminEsimNumberPackagesPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const list = await listNumberPackagesAdmin();
  return <EsimNumberPackagesAdmin list={list} canManage={canManage} />;
}

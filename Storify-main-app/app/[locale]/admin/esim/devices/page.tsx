import { setRequestLocale } from "next-intl/server";
import { listDevicesAdmin } from "@/lib/esim/admin/devices";
import { helpPagesState } from "@/lib/esim/admin/help-pages";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimDevicesAdmin } from "@/components/esim/admin/devices-admin";
import { HelpPagesCard } from "@/components/esim/admin/help-pages-card";

/** Admin → eSIM → Devices (ADM-11): the device-compatibility list, and the help pages (WEB-35). */
export default async function AdminEsimDevicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const raw = (await searchParams).search;
  const search = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const [list, pages] = await Promise.all([listDevicesAdmin(search), helpPagesState()]);
  return (
    <div className="space-y-6">
      <HelpPagesCard pages={pages} canManage={canManage} />
      <EsimDevicesAdmin list={list} search={search} canManage={canManage} />
    </div>
  );
}

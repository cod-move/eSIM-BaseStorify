import { setRequestLocale } from "next-intl/server";
import { listDevicesAdmin } from "@/lib/esim/admin/devices";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimDevicesAdmin } from "@/components/esim/admin/devices-admin";

/** Admin → eSIM → Devices (ADM-11): the device-compatibility list. */
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
  return <EsimDevicesAdmin list={await listDevicesAdmin(search)} search={search} canManage={canManage} />;
}

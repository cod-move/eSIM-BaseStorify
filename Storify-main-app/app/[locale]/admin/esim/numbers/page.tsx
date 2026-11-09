import { setRequestLocale } from "next-intl/server";
import { listNumbersAdmin, type AdminNumberFilters } from "@/lib/esim/admin/numbers";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimNumbersAdmin } from "@/components/esim/admin/numbers-admin";
import { EsimNumberSettingsCard } from "@/components/esim/admin/number-settings-card";
import { getNumberSettingsView } from "@/lib/esim/numbers/settings";
import { listQrRequests } from "@/lib/esim/numbers/requests";
import { EsimNumberQrRequests } from "@/components/esim/admin/number-qr-requests";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const STATUSES = ["all", "available", "reserved", "sold", "retired"] as const;

/** Admin → eSIM → Numbers (NUM-01): the number-card stock. */
export default async function AdminEsimNumbersPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const query = await searchParams;
  const status = one(query.status);
  const filters: AdminNumberFilters = {
    status: STATUSES.find((entry) => entry === status) ?? "all",
    dialCode: one(query.dialCode),
    search: one(query.search),
    page: Number(one(query.page)) || 1,
  };
  const [list, settings, qrRequests] = await Promise.all([listNumbersAdmin(filters), getNumberSettingsView(), listQrRequests()]);
  return (
    <div className="space-y-6">
      {qrRequests.length ? <EsimNumberQrRequests requests={qrRequests} canManage={canManage} /> : null}
      <EsimNumbersAdmin list={list} filters={filters} canManage={canManage} />
      <EsimNumberSettingsCard settings={settings} canManage={canManage} />
    </div>
  );
}

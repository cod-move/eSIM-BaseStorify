import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { listReferralCommissions, type CommissionView } from "@/lib/esim/admin/referrals";
import { getReferralSettings } from "@/lib/esim/referral/service";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimReferralsAdmin } from "@/components/esim/admin/referrals-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const VIEWS: CommissionView[] = ["attention", "pending", "credited", "cancelled", "all"];

/** Admin → eSIM → Referrals (REF-02..06): settings and every reward. */
export default async function AdminEsimReferralsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const view = VIEWS.includes(one(search.view) as CommissionView) ? (one(search.view) as CommissionView) : "attention";
  await connectDB();
  const [settings, list] = await Promise.all([
    getReferralSettings(),
    listReferralCommissions(view, { page: Number(one(search.page)) || 1, search: one(search.search) }),
  ]);
  return <EsimReferralsAdmin settings={settings} list={list} view={view} search={one(search.search) ?? ""} canManage={canManage} />;
}

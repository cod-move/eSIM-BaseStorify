import { setRequestLocale } from "next-intl/server";
import { kycAdminOverview, type SubmissionView } from "@/lib/esim/admin/kyc";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimKycAdmin } from "@/components/esim/admin/kyc-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const VIEWS: SubmissionView[] = ["pending", "approved", "rejected", "all"];
const TABS = ["review", "form", "rules"] as const;

/** Admin → eSIM → KYC (KYC-01..03): review, the form, and which plans need it. */
export default async function AdminEsimKycPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const view = VIEWS.includes(one(search.view) as SubmissionView) ? (one(search.view) as SubmissionView) : "pending";
  const tab = TABS.includes(one(search.tab) as (typeof TABS)[number]) ? (one(search.tab) as (typeof TABS)[number]) : "review";
  const { list, form, rules, storageReady } = await kycAdminOverview(view, { page: Number(one(search.page)) || 1, search: one(search.search) });
  return <EsimKycAdmin tab={tab} view={view} search={one(search.search) ?? ""} list={list} form={form} rules={rules} storageReady={storageReady} canManage={canManage} />;
}

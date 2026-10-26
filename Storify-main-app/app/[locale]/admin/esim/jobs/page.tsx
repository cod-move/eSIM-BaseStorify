import { setRequestLocale } from "next-intl/server";
import { listJobs } from "@/lib/esim/admin/jobs";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimJobsAdmin } from "@/components/esim/admin/jobs-admin";

/** Admin → eSIM → Scheduled jobs (ADM-10). */
export default async function AdminEsimJobsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  return <EsimJobsAdmin jobs={await listJobs()} canManage={canManage} />;
}

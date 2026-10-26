import { setRequestLocale } from "next-intl/server";
import { listJobs } from "@/lib/esim/admin/jobs";
import { getReminderSettings } from "@/lib/esim/admin/reminders";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimJobsAdmin } from "@/components/esim/admin/jobs-admin";
import { EsimRemindersCard } from "@/components/esim/admin/reminders-card";

/** Admin → eSIM → Scheduled jobs (ADM-10), and the shopper reminders the usage job sends. */
export default async function AdminEsimJobsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const [jobs, reminders] = await Promise.all([listJobs(), getReminderSettings()]);
  return (
    <div className="space-y-6">
      <EsimJobsAdmin jobs={jobs} canManage={canManage} />
      <EsimRemindersCard settings={reminders} canManage={canManage} />
    </div>
  );
}

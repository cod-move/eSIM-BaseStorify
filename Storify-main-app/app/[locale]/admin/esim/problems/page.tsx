import { setRequestLocale } from "next-intl/server";
import { listQueue, type QueueView } from "@/lib/esim/admin/queue";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimQueueAdmin } from "@/components/esim/admin/queue-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const VIEWS: QueueView[] = ["attention", "review", "failed", "stuck", "all"];

/** Admin → eSIM → Problems (ADM-08): fulfilment that needs a person. */
export default async function AdminEsimProblemsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const search = await searchParams;
  const view = VIEWS.includes(one(search.view) as QueueView) ? (one(search.view) as QueueView) : "attention";
  const queue = await listQueue(view, { page: Number(one(search.page)) || 1, search: one(search.search) });
  return <EsimQueueAdmin view={view} queue={queue} canManage={canManage} search={one(search.search) ?? ""} />;
}

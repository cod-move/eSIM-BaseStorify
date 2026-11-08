import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "@/components/language/link";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { listSupportTopics, type SupportTopicKind } from "@/lib/esim/account/support";
import { SupportRequestForm } from "@/components/esim/support-request";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * "Contact support" (account menu, inbox, eSIM and number pages): a message
 * to the store about one order, eSIM or number. `?order=` / `?esim=` /
 * `?number=` picks the item when the shopper comes from its page.
 */
export default async function AccountSupportPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const search = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const topics = await listSupportTopics(session.user.id);
  const asked = (["order", "esim", "number"] as SupportTopicKind[])
    .map((kind) => ({ kind, id: typeof search[kind] === "string" ? (search[kind] as string) : "" }))
    .find((entry) => entry.id && topics.some((topic) => topic.kind === entry.kind && topic.id === entry.id));

  return (
    <div className="space-y-6">
      <Link href="/account/inbox" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {tr("account.inbox.title", "Inbox")}
      </Link>
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.support.title", "Contact support")}</h1>
        <p className="text-sm text-muted-foreground">
          {tr("esim.support.subtitle", "Choose what it is about and write to us. Replies arrive in your inbox.")}
        </p>
      </div>
      <SupportRequestForm topics={topics} initial={asked} />
    </div>
  );
}

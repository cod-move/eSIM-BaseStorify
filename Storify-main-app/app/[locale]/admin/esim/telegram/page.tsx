import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { adminRewardEntries, adminTelegramLinks, redeemableVariants, rewardStats, telegramSettingsView } from "@/lib/esim/telegram/service";
import { EsimTelegramAdmin } from "@/components/esim/admin/telegram-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const KINDS = ["checkin", "redeem", "refund", "adjust", "referral", "invited"] as const;

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

/** Admin → eSIM → Telegram check-in: the bot, the rules, what the data buys, the linked accounts and the ledger. */
export default async function AdminEsimTelegramPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const query = await searchParams;
  const search = one(query.q) ?? "";
  const wanted = one(query.kind);
  const kind = KINDS.find((entry) => entry === wanted);
  await connectDB();
  const [settings, variants, stats, entries, links] = await Promise.all([
    telegramSettingsView(),
    redeemableVariants(),
    rewardStats(),
    adminRewardEntries({ kind, page: Number(one(query.epage)) || 1 }),
    adminTelegramLinks({ search, page: Number(one(query.page)) || 1 }),
  ]);
  return <EsimTelegramAdmin settings={settings} variants={variants} stats={stats} entries={entries} kind={kind ?? ""} links={links} search={search} canManage={canManage} />;
}

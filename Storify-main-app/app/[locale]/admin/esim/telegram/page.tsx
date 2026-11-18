import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { adminRewardEntries, redeemableVariants, rewardStats, telegramSettingsView } from "@/lib/esim/telegram/service";
import { EsimTelegramAdmin } from "@/components/esim/admin/telegram-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** Admin → eSIM → Telegram check-in: the bot, the rules, what the data buys, and the ledger. */
export default async function AdminEsimTelegramPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  await connectDB();
  const [settings, variants, stats, entries] = await Promise.all([telegramSettingsView(), redeemableVariants(), rewardStats(), adminRewardEntries({ limit: 50 })]);
  return <EsimTelegramAdmin settings={settings} variants={variants} stats={stats} entries={entries} canManage={canManage} />;
}

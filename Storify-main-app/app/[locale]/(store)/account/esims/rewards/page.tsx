import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { rewardsPage } from "@/lib/esim/telegram/service";
import { TelegramRewards } from "@/components/esim/telegram-rewards";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** Check-in rewards: link Telegram, the data saved from daily check-ins, and exchanging it for an eSIM. */
export default async function AccountRewardsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const data = await rewardsPage(session.user.id);
  return <TelegramRewards data={data} />;
}

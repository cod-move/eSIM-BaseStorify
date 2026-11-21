import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { rewardsPage } from "@/lib/esim/telegram/service";
import { referralCentre } from "@/lib/esim/referral/centre";
import { TelegramRewards, type WelfareTab } from "@/components/esim/telegram-rewards";
import { ReceivedSection } from "@/components/esim/welfare-sections";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TABS: WelfareTab[] = ["checkin", "received"];

/**
 * The rewards centre (福利中心): data for daily Telegram check-ins and for
 * joining through a friend's invite, on one balance that is exchanged for an
 * eSIM. Opens on check-ins; `?tab=received`. Inviting friends has its own
 * page (/account/esims/referrals).
 */
export default async function AccountRewardsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const wanted = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab = TABS.includes(wanted as WelfareTab) ? (wanted as WelfareTab) : "checkin";
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const historyPage = Number(Array.isArray(query.hpage) ? query.hpage[0] : query.hpage) || 1;
  const [data, centre] = await Promise.all([
    rewardsPage(session.user.id, { historyPage }),
    tab === "received" ? referralCentre(session.user.id) : null,
  ]);
  const receivedTab = centre ? <ReceivedSection centre={centre} locale={locale} /> : null;

  return <TelegramRewards data={data} tab={tab} receivedTab={receivedTab} />;
}

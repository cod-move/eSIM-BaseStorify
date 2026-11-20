import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { appBaseUrl } from "@/lib/app-url";
import { getAccountSession } from "@/lib/customers/account-data";
import { rewardsPage } from "@/lib/esim/telegram/service";
import { referralCentre } from "@/lib/esim/referral/centre";
import { destinationPath, listDestinations } from "@/lib/esim/storefront/catalog";
import { localizeDestinations } from "@/lib/esim/storefront/destination-names";
import { TelegramRewards, type WelfareTab } from "@/components/esim/telegram-rewards";
import { InviteSection, ReceivedSection } from "@/components/esim/welfare-sections";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TABS: WelfareTab[] = ["checkin", "invite", "received"];

/**
 * The rewards centre (福利中心): data for daily Telegram check-ins, for
 * inviting friends, and for joining through a friend's invite, on one
 * balance that is exchanged for an eSIM. `?tab=invite|received`.
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
  const [data, centre] = await Promise.all([rewardsPage(session.user.id), tab === "checkin" ? null : referralCentre(session.user.id)]);

  let inviteTab = null;
  let receivedTab = null;
  if (centre && tab === "invite") {
    // The countries a shopper may send a friend to (the invite link's "A country").
    const destinations = await listDestinations();
    const countries = (await localizeDestinations(destinations.filter((entry) => entry.scope === "local"), locale))
      .map((entry) => ({ name: entry.name, path: destinationPath(entry) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
    inviteTab = <InviteSection centre={centre} countries={countries} base={appBaseUrl()} locale={locale} />;
  }
  if (centre && tab === "received") receivedTab = <ReceivedSection centre={centre} locale={locale} />;

  return <TelegramRewards data={data} tab={tab} inviteTab={inviteTab} receivedTab={receivedTab} />;
}

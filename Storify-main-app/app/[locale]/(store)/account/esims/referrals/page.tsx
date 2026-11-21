import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "@/components/language/link";
import { connectDB } from "@/lib/db";
import { appBaseUrl } from "@/lib/app-url";
import { getAccountSession } from "@/lib/customers/account-data";
import { referralCentre } from "@/lib/esim/referral/centre";
import { destinationPath, listDestinations } from "@/lib/esim/storefront/catalog";
import { localizeDestinations } from "@/lib/esim/storefront/destination-names";
import { InviteSection } from "@/components/esim/welfare-sections";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Invite friends (REF-05), in the account menu of its own: the link, the
 * offer, the rewards (the last month unless `?rewards=all`) and the people
 * invited, a page at a time (`?page=`).
 */
export default async function AccountReferralsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const query = await searchParams;
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const allRewards = one(query.rewards) === "all";
  const [t, centre, destinations] = await Promise.all([
    getTranslations(),
    referralCentre(session.user.id, { friendsPage: Number(one(query.page)) || 1, ...(allRewards ? { rewardsSince: null } : {}) }),
    listDestinations(),
  ]);
  // The countries a shopper may send a friend to (the invite link's "A country").
  const countries = (await localizeDestinations(destinations.filter((entry) => entry.scope === "local"), locale))
    .map((entry) => ({ name: entry.name, path: destinationPath(entry) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  const tr = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/account/esims" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          {tr("esim.account.back", "My eSIMs")}
        </Link>
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.referral.title", "Invite friends")}</h1>
      </div>
      <InviteSection centre={centre} countries={countries} base={appBaseUrl()} locale={locale} allRewards={allRewards} />
    </div>
  );
}

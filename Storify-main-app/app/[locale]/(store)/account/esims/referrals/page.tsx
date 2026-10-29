import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "@/components/language/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { referralCentre } from "@/lib/esim/referral/centre";
import { formatStorePrice } from "@/lib/esim/topup/format";
import { ReferralCode } from "@/components/esim/referral-code";

interface PageProps {
  params: Promise<{ locale: string }>;
}

const STATUS_TEXT = { pending: "On hold", credited: "Added to your balance", cancelled: "Cancelled (order refunded)" } as const;

/** The referral centre (REF-05): invite link and code, the offer, who joined and every reward. */
export default async function AccountReferralsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const centre = await referralCentre(session.user.id);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const money = (units: number) => formatStorePrice(Math.round(units * 100), locale);
  const reward =
    centre.offer.commissionType === "percent"
      ? tr("esim.referral.offerPercent", "{value}% of each order they pay for", { value: centre.offer.commissionValue })
      : tr("esim.referral.offerFixed", "{value} for each order they pay for", { value: money(centre.offer.commissionValue / 100) });
  const limits = [
    centre.offer.orderLimit > 0 ? tr("esim.referral.limitOrders", "their first {count} orders", { count: centre.offer.orderLimit }) : null,
    centre.offer.validityDays > 0 ? tr("esim.referral.limitDays", "within {count} days of joining", { count: centre.offer.validityDays }) : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Link href="/account/esims" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {tr("esim.account.back", "My eSIMs")}
      </Link>
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.referral.title", "Invite friends")}</h1>
        {centre.enabled ? (
          <p className="text-sm text-muted-foreground">
            {tr("esim.referral.offer", "You get {reward}", { reward })}
            {limits.length ? ` (${limits.join(", ")})` : ""}.{" "}
            {centre.offer.coupon.enabled
              ? tr("esim.referral.friendGets", "Your friend gets {discount} off their first order.", {
                  discount: centre.offer.coupon.type === "percentage" ? `${centre.offer.coupon.value}%` : money(centre.offer.coupon.value / 100),
                })
              : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("esim.referral.paused", "Referral rewards are paused at the moment.")}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.referral.share", "Share your link")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralCode code={centre.code} link={centre.link} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">{tr("esim.referral.joined", "Joined")}</div><div className="text-2xl font-bold">{centre.invited.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">{tr("esim.referral.paid", "Rewards received")}</div><div className="text-2xl font-bold">{money(centre.totals.paid)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">{tr("esim.referral.pending", "On hold")}</div><div className="text-2xl font-bold">{money(centre.totals.pending)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.referral.friends", "People you invited")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {centre.invited.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("esim.referral.noFriends", "Nobody has joined with your link yet.")}</p>
          ) : (
            centre.invited.map((entry) => (
              <div key={entry.id} className="flex justify-between gap-4 py-2 text-sm">
                <span>{entry.who}</span>
                <span className="text-muted-foreground">
                  {date.format(entry.joinedAt)}
                  {entry.rewards > 0 ? ` · ${money(entry.rewards)}` : ""}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.referral.rewards", "Rewards")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {centre.rewards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("esim.referral.noRewards", "No rewards yet.")}</p>
          ) : (
            centre.rewards.map((entry) => (
              <div key={entry.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
                <div>
                  <div className="font-medium">{money(entry.amount)}</div>
                  <div className="text-xs text-muted-foreground">{tr("esim.account.order", "Order {number}", { number: entry.orderNumber })} · {date.format(entry.createdAt)}</div>
                </div>
                <div className="text-end text-xs text-muted-foreground">
                  {tr(`esim.referral.status.${entry.status}`, STATUS_TEXT[entry.status])}
                  {entry.status === "pending" ? ` · ${tr("esim.referral.payableOn", "from {date}", { date: date.format(entry.payableAt) })}` : ""}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

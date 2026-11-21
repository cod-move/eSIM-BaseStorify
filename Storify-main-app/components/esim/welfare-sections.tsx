import { getTranslations } from "next-intl/server";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/language/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReferralCode } from "@/components/esim/referral-code";
import { formatStorePrice } from "@/lib/esim/topup/format";
import { formatMb } from "@/lib/esim/telegram/format";
import type { ReferralCentre } from "@/lib/esim/referral/centre";

/**
 * The welfare centre's "Invite friends" and "Data received" tabs: the
 * referral centre (REF-05) as it was on its own page, showing data rewards
 * when the store (or the shopper's own rules) rewards in data, and what the
 * shopper got for joining through a friend's link.
 */

const STATUS_TEXT = { pending: "On hold", credited: "Added to your balance", cancelled: "Cancelled (order refunded)" } as const;

async function translator() {
  const t = await getTranslations();
  return (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export async function InviteSection({
  centre,
  countries,
  base,
  locale,
  allRewards = false,
}: {
  centre: ReferralCentre;
  countries: Array<{ name: string; path: string }>;
  base: string;
  locale: string;
  /** Every reward listed, not only the last month's. */
  allRewards?: boolean;
}) {
  const tr = await translator();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const money = (units: number) => formatStorePrice(Math.round(units * 100), locale);
  const data = centre.offer.rewardType === "data";
  const href = (page: number, all: boolean) => {
    const params = new URLSearchParams();
    if (all) params.set("rewards", "all");
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/account/esims/referrals?${query}` : "/account/esims/referrals";
  };
  const pageHref = (page: number) => href(page, allRewards);
  // Money and data rewards in one list, newest first.
  const rewardRows = [
    ...centre.rewards.map((entry) => ({ kind: "money" as const, at: entry.createdAt, entry })),
    ...centre.dataRewards.map((entry) => ({ kind: "data" as const, at: entry.createdAt, entry })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const when = (on: "signup" | "first_order") =>
    on === "signup" ? tr("esim.referral.whenSignup", "when they sign up") : tr("esim.referral.whenFirstOrder", "after their first order");

  let offer: string;
  let friend = "";
  if (data) {
    offer = tr("esim.referral.offerData", "You get {amount} of data for each friend who joins with your link, {when}.", {
      amount: formatMb(centre.offer.data.referrerMb),
      when: when(centre.offer.data.referrerOn),
    });
    if (centre.offer.data.inviteeMb > 0) {
      friend = tr("esim.referral.friendGetsData", "Your friend gets {amount} of data {when}.", {
        amount: formatMb(centre.offer.data.inviteeMb),
        when: when(centre.offer.data.inviteeOn),
      });
    }
  } else {
    const reward =
      centre.offer.commissionType === "percent"
        ? tr("esim.referral.offerPercent", "{value}% of each order they pay for", { value: centre.offer.commissionValue })
        : tr("esim.referral.offerFixed", "{value} for each order they pay for", { value: money(centre.offer.commissionValue / 100) });
    const limits = [
      centre.offer.orderLimit > 0 ? tr("esim.referral.limitOrders", "their first {count} orders", { count: centre.offer.orderLimit }) : null,
      centre.offer.validityDays > 0 ? tr("esim.referral.limitDays", "within {count} days of joining", { count: centre.offer.validityDays }) : null,
    ].filter(Boolean);
    offer = `${tr("esim.referral.offer", "You get {reward}", { reward })}${limits.length ? ` (${limits.join(", ")})` : ""}.`;
  }
  if (centre.offer.coupon.enabled) {
    friend = [
      friend,
      tr("esim.referral.friendGets", "Your friend gets {discount} off their first order.", {
        discount: centre.offer.coupon.type === "percentage" ? `${centre.offer.coupon.value}%` : money(centre.offer.coupon.value / 100),
      }),
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {centre.enabled ? `${offer} ${friend}`.trim() : tr("esim.referral.paused", "Referral rewards are paused at the moment.")}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.referral.share", "Share your link")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralCode code={centre.code} base={base} countries={countries} />
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={tr("esim.referral.joined", "Joined")} value={centre.invitedTotal} />
        {data || centre.dataEarnedMb > 0 ? <Stat label={tr("esim.referral.dataEarned", "Data earned")} value={formatMb(centre.dataEarnedMb)} /> : null}
        {!data || centre.totals.paid > 0 ? <Stat label={tr("esim.referral.paid", "Rewards received")} value={money(centre.totals.paid)} /> : null}
        {!data || centre.totals.pending > 0 ? <Stat label={tr("esim.referral.pending", "On hold")} value={money(centre.totals.pending)} /> : null}
      </div>

      {centre.rewardsEver > 0 ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">
              {tr("esim.referral.rewards", "Rewards")}
              {centre.rewardsSince ? <span className="ms-2 text-sm font-normal text-muted-foreground">{tr("esim.referral.rewardsRecent", "Last 30 days")}</span> : null}
            </CardTitle>
            <Link href={href(1, !allRewards)} scroll={false} className="text-sm text-primary hover:underline">
              {allRewards ? tr("esim.referral.rewardsShowRecent", "Last 30 days only") : tr("esim.referral.rewardsShowAll", "Show all")}
            </Link>
          </CardHeader>
          <CardContent className="divide-y">
            {rewardRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tr("esim.referral.rewardsNoneRecent", "No rewards in the last 30 days.")}</p>
            ) : (
              rewardRows.map((row) =>
                row.kind === "money" ? (
                  <div key={row.entry.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
                    <div>
                      <div className="font-medium">{money(row.entry.amount)}</div>
                      <div className="text-xs text-muted-foreground">
                        {tr("esim.account.order", "Order {number}", { number: row.entry.orderNumber })} · {date.format(row.entry.createdAt)}
                      </div>
                    </div>
                    <div className="text-end text-xs text-muted-foreground">
                      {tr(`esim.referral.status.${row.entry.status}`, STATUS_TEXT[row.entry.status])}
                      {row.entry.status === "pending" ? ` · ${tr("esim.referral.payableOn", "from {date}", { date: date.format(row.entry.payableAt) })}` : ""}
                    </div>
                  </div>
                ) : (
                  <div key={row.entry.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
                    <div>
                      <div className="font-medium text-emerald-600 dark:text-emerald-400">+{formatMb(row.entry.mb)}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.entry.who} · {date.format(row.entry.createdAt)}
                      </div>
                    </div>
                    <div className="text-end text-xs text-muted-foreground">{tr("esim.referral.dataAdded", "Added to your data")}</div>
                  </div>
                ),
              )
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.referral.friends", "People you invited")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {centre.invitedTotal === 0 ? (
            <p className="text-sm text-muted-foreground">{tr("esim.referral.noFriends", "Nobody has joined with your link yet.")}</p>
          ) : (
            centre.invited.map((entry) => (
              <div key={entry.id} className="flex justify-between gap-4 py-2 text-sm">
                <span>{entry.who}</span>
                <span className="text-muted-foreground">
                  {date.format(entry.joinedAt)}
                  {entry.dataMb > 0 ? ` · +${formatMb(entry.dataMb)}` : ""}
                  {entry.rewards > 0 ? ` · ${money(entry.rewards)}` : ""}
                </span>
              </div>
            ))
          )}
          {centre.invitedTotalPages > 1 ? (
            <div className="flex items-center justify-center gap-3 pt-3 text-sm">
              {centre.invitedPage > 1 ? (
                <Link href={pageHref(centre.invitedPage - 1)} scroll={false} className="inline-flex items-center rounded-md border px-2 py-1 hover:bg-muted" aria-label={tr("esim.referral.previous", "Previous")}>
                  <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                </Link>
              ) : null}
              <span className="text-muted-foreground">
                {centre.invitedPage} / {centre.invitedTotalPages}
              </span>
              {centre.invitedPage < centre.invitedTotalPages ? (
                <Link href={pageHref(centre.invitedPage + 1)} scroll={false} className="inline-flex items-center rounded-md border px-2 py-1 hover:bg-muted" aria-label={tr("esim.referral.next", "Next")}>
                  <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                </Link>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

    </div>
  );
}

export async function ReceivedSection({ centre, locale }: { centre: ReferralCentre; locale: string }) {
  const tr = await translator();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const money = (units: number) => formatStorePrice(Math.round(units * 100), locale);
  const received = centre.received;
  const coupon = centre.welcomeCoupon;

  if (!received && !coupon) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          {tr("esim.rewards.receivedNone", "You did not join through a friend's invite. Invite friends to earn data instead.")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {received ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("esim.rewards.receivedTitle", "Data from your invite")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-muted-foreground">
              {tr("esim.rewards.receivedFrom", "You joined through {who}'s invite on {date}.", { who: received.from, date: date.format(received.joinedAt) })}
            </p>
            {received.dataMb > 0 ? (
              <p>
                <span className="text-2xl font-bold">+{formatMb(received.dataMb)}</span>{" "}
                <span className="text-muted-foreground">
                  {received.dataAt ? tr("esim.rewards.receivedOn", "added on {date}", { date: date.format(received.dataAt) }) : ""}
                </span>
              </p>
            ) : received.pendingMb > 0 ? (
              <p>{tr("esim.rewards.receivedPending", "{amount} of data is added after your first order.", { amount: formatMb(received.pendingMb) })}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {coupon ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("esim.referral.welcomeTitle", "Your welcome coupon")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-mono text-lg font-bold">{coupon.code}</div>
            <div>
              {tr("esim.referral.welcomeOff", "{discount} off", { discount: coupon.type === "percentage" ? `${coupon.value}%` : money(coupon.value) })}
              {coupon.minOrder > 0 ? ` · ${tr("esim.referral.welcomeMin", "orders from {amount}", { amount: money(coupon.minOrder) })}` : ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {coupon.active
                ? coupon.endsAt
                  ? tr("esim.referral.welcomeEnds", "Enter it at checkout before {date}.", { date: date.format(coupon.endsAt) })
                  : tr("esim.referral.welcomeUse", "Enter it at checkout.")
                : tr("esim.referral.welcomeDone", "Used or expired.")}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

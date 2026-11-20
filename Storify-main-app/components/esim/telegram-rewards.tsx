"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, Gift, Send, Users } from "lucide-react";
import Link from "@/components/language/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast-notification";
import { useConfirmation } from "@/components/ui/confirmation-dialog";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { formatMb } from "@/lib/esim/telegram/format";

type Data = {
  enabled: boolean;
  botUsername: string | null;
  groupLink: string | null;
  link: { username: string | null; firstName: string | null; linkedAt: string } | null;
  account: { balanceMb: number; earnedMb: number; spentMb: number; checkins: number; lastCheckinDay: string | null };
  history: Array<{ id: string; kind: "checkin" | "redeem" | "refund" | "adjust" | "referral" | "invited"; mb: number; status: string; itemName: string | null; orderNumber: string | null; note: string | null; createdAt: string }>;
  items: Array<{ id: string; name: string; costMb: number }>;
};

async function readError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message || body.error || fallback;
  } catch {
    return fallback;
  }
}

const requestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/**
 * The rewards centre (福利中心): the data saved so far, three tabs — check-in
 * on Telegram (link it via the bot's start link or /bind), invite friends,
 * and data received for joining — then the eSIMs the data buys and every
 * entry. The invite and received tabs are rendered on the server and passed in.
 */
export type WelfareTab = "checkin" | "invite" | "received";

export function TelegramRewards({ data, tab, inviteTab, receivedTab }: { data: Data; tab: WelfareTab; inviteTab: ReactNode; receivedTab: ReactNode }) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { confirm } = useConfirmation();
  const [busy, setBusy] = useState<string | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleString();
  const botLink = data.botUsername ? `https://t.me/${data.botUsername}` : null;

  async function linkTelegram() {
    setBusy("link");
    try {
      const response = await fetch("/api/esim/me/telegram", { method: "POST" });
      if (!response.ok) {
        toast.error(await readError(response, t("esim.rewards.linkFailed", "Could not start linking. Please try again.")));
        return;
      }
      const { data: result } = (await response.json()) as { data: { url: string } };
      window.location.href = result.url;
    } finally {
      setBusy(null);
    }
  }

  async function unlink() {
    const ok = await confirm({
      title: t("esim.rewards.unlinkTitle", "Unlink Telegram?"),
      description: t("esim.rewards.unlinkBody", "Check-ins from that Telegram account will stop counting. The data you have saved stays."),
      variant: "destructive",
    });
    if (!ok) return;
    setBusy("unlink");
    try {
      const response = await fetch("/api/esim/me/telegram", { method: "DELETE" });
      if (!response.ok) {
        toast.error(await readError(response, t("esim.rewards.unlinkFailed", "Could not unlink. Please try again.")));
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function redeem(item: Data["items"][number]) {
    const ok = await confirm({
      title: t("esim.rewards.redeemTitle", "Exchange for this eSIM?"),
      description: t("esim.rewards.redeemBody", "{name} for {amount} of your saved data. The eSIM appears in My eSIMs and is emailed to you.", {
        name: item.name,
        amount: formatMb(item.costMb),
      }),
    });
    if (!ok) return;
    setBusy(item.id);
    try {
      const response = await fetch("/api/esim/me/telegram/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, requestId: requestId() }),
      });
      if (!response.ok) {
        toast.error(await readError(response, t("esim.rewards.redeemFailed", "The exchange did not go through. Please try again.")));
        router.refresh();
        return;
      }
      const { data: result } = (await response.json()) as { data: { orderNumber: string } };
      toast.success(t("esim.rewards.redeemDone", "Exchanged! Order {number}: your eSIM is on its way.", { number: result.orderNumber }));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const kindLabel = (row: Data["history"][number]) => {
    switch (row.kind) {
      case "checkin":
        return t("esim.rewards.kindCheckin", "Daily check-in");
      case "redeem":
        return row.status === "failed"
          ? t("esim.rewards.kindRedeemFailed", "Exchange (failed): {name}", { name: row.itemName ?? "" })
          : t("esim.rewards.kindRedeem", "Exchanged: {name}", { name: row.itemName ?? "" });
      case "refund":
        return t("esim.rewards.kindRefund", "Given back: {name}", { name: row.itemName ?? "" });
      case "referral":
        return t("esim.rewards.kindReferral", "A friend you invited");
      case "invited":
        return t("esim.rewards.kindInvited", "Joined through a friend's invite");
      default:
        return row.note ? t("esim.rewards.kindAdjustNote", "Adjusted by us: {note}", { note: row.note }) : t("esim.rewards.kindAdjust", "Adjusted by us");
    }
  };

  const tabs: Array<{ id: WelfareTab; label: string }> = [
    { id: "checkin", label: t("esim.rewards.tabCheckin", "Check-in data") },
    { id: "invite", label: t("esim.rewards.tabInvite", "Invite friends") },
    { id: "received", label: t("esim.rewards.tabReceived", "Data received") },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/account/esims" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          {t("esim.account.back", "My eSIMs")}
        </Link>
        <h1 className="text-xl font-bold sm:text-2xl">{t("esim.rewards.centre", "Rewards centre")}</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {t("esim.rewards.centreDescription", "Get free data by checking in on Telegram and inviting friends, and exchange it for an eSIM.")}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 pt-6">
          <div>
            <div className="text-sm text-muted-foreground">{t("esim.rewards.balance", "Data saved")}</div>
            <div className="text-3xl font-bold">{formatMb(data.account.balanceMb)}</div>
          </div>
          <div className="text-sm text-muted-foreground">
            {t("esim.rewards.totalsAll", "{earned} earned · {spent} exchanged", {
              earned: formatMb(data.account.earnedMb),
              spent: formatMb(data.account.spentMb),
            })}
          </div>
        </CardContent>
      </Card>

      <nav className="flex gap-1 overflow-x-auto border-b" aria-label={t("esim.rewards.centre", "Rewards centre")}>
        {tabs.map((entry) => (
          <Link
            key={entry.id}
            href={entry.id === "checkin" ? "/account/esims/rewards" : `/account/esims/rewards?tab=${entry.id}`}
            scroll={false}
            aria-current={tab === entry.id ? "page" : undefined}
            className={
              tab === entry.id
                ? "-mb-px whitespace-nowrap border-b-2 border-primary px-3 py-2 text-sm font-medium"
                : "-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {tab === "invite" ? inviteTab : null}
      {tab === "received" ? receivedTab : null}
      {tab === "checkin" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("esim.rewards.description", "Check in once a day in our Telegram group for free data, save it up, and exchange it for an eSIM.")}
          </p>
          {!data.enabled ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">{t("esim.rewards.closed", "Check-in rewards are not open at the moment.")}</CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Telegram</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {t("esim.rewards.checkinCount", "{count} check-ins so far", { count: data.account.checkins })}
              </p>
              {data.link ? (
                <>
                  <p>
                    {t("esim.rewards.linkedAs", "Linked to {name}", {
                      name: data.link.username ? `@${data.link.username}` : data.link.firstName || "Telegram",
                    })}
                  </p>
                  <p className="text-muted-foreground">{t("esim.rewards.howToCheckin", "Send /checkin or 签到 in the group once a day.")}</p>
                  {data.groupLink ? (
                    <Button asChild size="sm" className="me-2">
                      <a href={data.groupLink} target="_blank" rel="noreferrer">
                        <Users className="me-2 h-4 w-4" />
                        {t("esim.rewards.joinGroup", "Open the group to check in")}
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" onClick={unlink} disabled={busy !== null}>
                    {t("esim.rewards.unlink", "Unlink")}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">{t("esim.rewards.notLinked", "Link your Telegram account to start checking in.")}</p>
                  <Button size="sm" onClick={linkTelegram} disabled={busy !== null || !data.botUsername}>
                    <Send className="me-2 h-4 w-4" />
                    {t("esim.rewards.link", "Link Telegram")}
                  </Button>
                  {botLink ? (
                    <p className="text-xs text-muted-foreground">
                      {t("esim.rewards.linkByEmail", "Or message the bot {bot} and send /bind with your email.", { bot: `@${data.botUsername}` })}
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("esim.rewards.exchange", "Exchange for an eSIM")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.items.length ? (
            <div className="divide-y">
              {data.items.map((item) => {
                const short = item.costMb - data.account.balanceMb;
                return (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        {item.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {short > 0
                          ? t("esim.rewards.costShort", "{amount} · {short} more to go", { amount: formatMb(item.costMb), short: formatMb(short) })
                          : formatMb(item.costMb)}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => redeem(item)} disabled={!data.enabled || short > 0 || busy !== null}>
                      {busy === item.id ? t("esim.rewards.redeeming", "Exchanging…") : t("esim.rewards.redeem", "Exchange")}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("esim.rewards.noItems", "Nothing to exchange yet. Check back soon.")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("esim.rewards.history", "History")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.history.length ? (
            <div className="divide-y">
              {data.history.map((row) => (
                <div key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                  <div className="min-w-0">
                    <div>{kindLabel(row)}</div>
                    <div className="text-xs text-muted-foreground">
                      {date(row.createdAt)}
                      {row.orderNumber ? ` · ${t("esim.account.order", "Order {number}", { number: row.orderNumber })}` : ""}
                    </div>
                  </div>
                  <div className={row.mb >= 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium"}>
                    {row.mb >= 0 ? "+" : ""}
                    {formatMb(row.mb)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("esim.rewards.noHistory", "No check-ins yet.")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

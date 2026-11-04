import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronRight, Phone, Smartphone } from "lucide-react";
import Link from "@/components/language/link";
import { Card, CardContent } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { listCustomerEsims } from "@/lib/esim/account/esims";
import { formatBytes, remainingPercent } from "@/lib/esim/account/display";
import { EsimStatusBadge, UsageBar } from "@/components/esim/esim-status-badge";
import { storeCreditSummary } from "@/lib/store-credit/store-credit";
import { formatStorePrice } from "@/lib/esim/topup/format";
import { listCustomerNumbers } from "@/lib/esim/numbers/account";
import { formatAmount } from "@/lib/esim/numbers/line";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** "My eSIMs" (USR-01): the shopper's numbers (NUM-06), then every eSIM they bought, newest first. The layout has already required a session. */
export default async function AccountEsimsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  const session = await getAccountSession();
  await connectDB();
  const [esims, balances, numbers] = session
    ? await Promise.all([listCustomerEsims(session.user.id), storeCreditSummary(session.user.id), listCustomerNumbers(session.user.id)])
    : [[], [], []];
  const balance = balances.find((entry) => entry.currency === "USD")?.balance ?? 0;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <div className="hidden lg:block">
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.account.title", "My eSIMs")}</h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {tr("esim.account.description", "Install, check remaining data and top up your eSIMs.")}
        </p>
      </div>

      <Link href="/account/esims/balance" className="block">
        <Card className="transition-colors hover:bg-muted/40">
          <CardContent className="flex items-center justify-between gap-4 p-4 text-sm">
            <span>
              {tr("esim.wallet.title", "Balance")}: <b>{formatStorePrice(Math.round(balance * 100), locale)}</b>
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-primary">
              {tr("esim.wallet.add", "Add money")}
              <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            </span>
          </CardContent>
        </Card>
      </Link>
      <Link href="/account/esims/referrals" className="block">
        <Card className="transition-colors hover:bg-muted/40">
          <CardContent className="flex items-center justify-between gap-4 p-4 text-sm">
            <span>{tr("esim.referral.teaser", "Invite friends and earn a reward on their orders")}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
          </CardContent>
        </Card>
      </Link>
      <Link href="/account/esims/verification" className="block text-sm text-muted-foreground hover:text-foreground">
        {tr("esim.kyc.link", "Identity verification")} →
      </Link>

      {numbers.length ? (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">{tr("esim.number.myNumbers", "My numbers")}</h2>
          {numbers.map((number) => (
            <Link key={number.id} href={`/account/esims/numbers/${number.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <Phone className="h-6 w-6 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="font-mono font-medium">
                      +{number.dialCode} {number.nationalNumber}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[
                        number.card?.balanceMinor !== null && number.card?.balanceMinor !== undefined
                          ? tr("esim.number.creditLeft", "Credit {amount}", { amount: formatAmount(number.card.balanceMinor, number.card.currency ?? "EUR") })
                          : null,
                        number.validUntil ? tr("esim.number.keptUntil", "Kept until {date}", { date: date.format(number.validUntil) }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </CardContent>
              </Card>
            </Link>
          ))}
          {esims.length ? <h2 className="pt-2 text-base font-semibold">{tr("esim.account.title", "My eSIMs")}</h2> : null}
        </div>
      ) : null}

      {esims.length === 0 && numbers.length ? null : esims.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Smartphone className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{tr("esim.account.empty", "You have no eSIMs yet.")}</p>
            <Link href="/esim" className="text-sm font-medium text-primary hover:underline">
              {tr("esim.account.browse", "Find an eSIM for your trip")}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {esims.map((esim) => {
            const percent = remainingPercent(esim.usage?.totalBytes, esim.usage?.remainingBytes);
            return (
              <Link key={esim.id} href={`/account/esims/${esim.id}`} className="block">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="text-2xl" aria-hidden>{esim.emoji ?? "📶"}</div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{esim.remark || esim.planName}</span>
                        <EsimStatusBadge display={esim.display} label={tr(`esim.status.${esim.display.status}`, esim.display.label)} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {esim.remark ? `${esim.planName} · ` : ""}
                        {tr("esim.account.order", "Order {number}", { number: esim.orderNumber })}
                        {esim.expiresAt ? ` · ${tr("esim.account.expires", "Expires {date}", { date: date.format(esim.expiresAt) })}` : ""}
                      </div>
                      {percent !== null ? (
                        <div className="flex max-w-xs items-center gap-2">
                          <UsageBar percent={percent} />
                          <span className="whitespace-nowrap text-xs text-muted-foreground">
                            {tr("esim.account.left", "{amount} left", { amount: formatBytes(esim.usage?.remainingBytes) })}
                          </span>
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

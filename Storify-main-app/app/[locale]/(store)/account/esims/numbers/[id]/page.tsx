import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft, Clock } from "lucide-react";
import { SupportLink } from "@/components/esim/support-link";
import Link from "@/components/language/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { getCustomerNumber, listCustomerNumbers } from "@/lib/esim/numbers/account";
import { formatCardBytes, packageLeftPercent } from "@/lib/esim/numbers/install";
import { formatAmount } from "@/lib/esim/numbers/line";
import { installLinks } from "@/lib/esim/fulfillment/install-links";
import { UsageBar } from "@/components/esim/esim-status-badge";
import { CopyValue, RefreshUsageButton, RemarkEditor } from "@/components/esim/esim-actions";
import { CancelPacketButton, NumberTopupActions } from "@/components/esim/number-actions";
import { SendSmsButton, TransferCreditButton } from "@/components/esim/number-card-tools";
import { NumberHistoryCard, NumberServicesCard } from "@/components/esim/number-services";
import { NumberDiagnosticsCard, NumberManageCard } from "@/components/esim/number-manage";
import { latestQrRequest } from "@/lib/esim/numbers/requests";
import { getNumberSettings } from "@/lib/esim/numbers/settings";
import { numberTopupOptions } from "@/lib/esim/numbers/storefront";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * One number card (NUM-06/07): "+372 5550 1234" with its balance, state, last
 * use and data packages, read from TopConnect as the page opens (at most once
 * a minute), and how to install it — QR code, one-tap links, the manual
 * details and PIN/PUK. Credit and data packages are bought from here, and a
 * package listed with its code can be cancelled (NUM-08/09). Its services
 * (data, texts, calls, voicemail, call forwarding) and its history (calls,
 * texts, data sessions, recharges, voicemail) load from TopConnect as the
 * page opens. Rendered only
 * for the number's owner, after payment.
 */
export default async function AccountNumberPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const [number, topupOptions, mine, numberSettings] = await Promise.all([
    getCustomerNumber(session.user.id, id),
    numberTopupOptions(),
    listCustomerNumbers(session.user.id),
    getNumberSettings(),
  ]);
  if (!number) notFound();
  const qrRequest = await latestQrRequest(number.id);

  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const lpa = number.install.lpa;
  const qr = lpa ? await QRCode.toDataURL(lpa, { width: 320, margin: 2, errorCorrectionLevel: "M" }) : null;
  const links = installLinks(lpa);
  const card = number.card;
  const titleOf = (entry: { dialCode: string; nationalNumber: string }) => `+${entry.dialCode} ${entry.nationalNumber.replace(/(\d{3,4})(?=(\d{4})+$)/g, "$1 ")}`;
  const title = titleOf(number);
  // Credit may go to any number; the shopper's other numbers are offered.
  const transferTargets = mine
    .filter((entry) => entry.id !== number.id && !entry.card?.blocked)
    .map((entry) => ({ msisdn: entry.msisdn, title: entry.remark ? `${titleOf(entry)} · ${entry.remark}` : titleOf(entry) }));
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex justify-between gap-4 py-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-end">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/account/esims" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
          {tr("esim.account.back", "My eSIMs")}
        </Link>
        <SupportLink query={`number=${number.id}`} label={tr("esim.support.title", "Contact support")} />
      </div>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-xl font-bold sm:text-2xl">{title}</h1>
          {card?.blocked ? (
            <Badge variant="destructive">{tr("esim.number.blocked", "Blocked")}</Badge>
          ) : (
            <Badge>{tr("esim.number.active", "Active")}</Badge>
          )}
        </div>
        <RemarkEditor esimId={number.id} remark={number.remark} endpoint={`/api/esim/me/numbers/${number.id}`} />
      </div>

      {number.pending.length ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {tr("esim.number.pending", "Being added to the number: {items}. This usually takes a few minutes.", {
              items: number.pending.join(", "),
            })}
          </span>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">{tr("esim.number.card", "Balance and data")}</CardTitle>
          <RefreshUsageButton esimId={number.id} endpoint={`/api/esim/me/numbers/${number.id}/refresh`} />
        </CardHeader>
        <CardContent className="space-y-3">
          {card ? (
            <>
              <div className="text-2xl font-bold">
                {card.balanceMinor !== null ? formatAmount(card.balanceMinor, card.currency ?? "EUR") : "—"}
                <span className="ms-2 text-sm font-normal text-muted-foreground">{tr("esim.number.balance", "credit")}</span>
              </div>
              {card.packages.length ? (
                <div className="space-y-3">
                  {card.packages.map((entry, index) => {
                    const percent = packageLeftPercent(entry.totalBytes, entry.leftBytes);
                    return (
                      <div key={index} className="space-y-1.5 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{entry.name ?? tr("esim.number.packet", "Data package")}</span>
                          {entry.status === "ordered" ? (
                            <Badge variant="outline">{tr("esim.number.packetOrdered", "Starts with your next data session")}</Badge>
                          ) : entry.packetId && !card.blocked ? (
                            <CancelPacketButton numberId={number.id} packetId={entry.packetId} name={entry.name ?? tr("esim.number.packet", "Data package")} />
                          ) : null}
                        </div>
                        {percent !== null ? (
                          <>
                            <UsageBar percent={percent} />
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{tr("esim.account.left", "{amount} left", { amount: formatCardBytes(entry.leftBytes) ?? "—" })}</span>
                              <span>{tr("esim.account.ofTotal", "of {amount}", { amount: formatCardBytes(entry.totalBytes) ?? "—" })}</span>
                            </div>
                          </>
                        ) : null}
                        {entry.expiresAt ? (
                          <div className="text-xs text-muted-foreground">
                            {tr("esim.number.packetUntil", "Until {date}", { date: dateTime.format(entry.expiresAt) })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{tr("esim.number.noPackets", "No data package on the number right now.")}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{tr("esim.number.noCard", "The balance appears once the network answers. Refresh to check.")}</p>
          )}
          {!card?.blocked ? (
            <NumberTopupActions numberId={number.id} title={title} options={topupOptions}>
              <SendSmsButton numberId={number.id} title={title} />
              <TransferCreditButton numberId={number.id} title={title} balanceMinor={card?.balanceMinor ?? null} currency={card?.currency ?? "EUR"} targets={transferTargets} />
            </NumberTopupActions>
          ) : null}
          {number.refreshFailed && card?.checkedAt ? (
            <p className="text-xs text-muted-foreground">
              {tr("esim.number.stale", "The network did not answer just now; this is from {time}.", { time: dateTime.format(card.checkedAt) })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <NumberServicesCard numberId={number.id} currency={card?.currency ?? "EUR"} />
      <NumberHistoryCard numberId={number.id} currency={card?.currency ?? "EUR"} />
      <NumberDiagnosticsCard numberId={number.id} testSms={!card?.blocked ? <SendSmsButton numberId={number.id} title={title} /> : null} />
      <NumberManageCard
        numberId={number.id}
        msisdn={number.msisdn}
        title={title}
        blocked={card?.blocked === true}
        qr={{
          enabled: numberSettings.qrEnabled,
          feeMinor: numberSettings.qrFeeMinor,
          currency: card?.currency ?? "EUR",
          latest: qrRequest
            ? { state: qrRequest.state, createdAt: qrRequest.createdAt.toISOString(), note: qrRequest.resolution?.note ?? qrRequest.lastError?.message ?? null }
            : null,
        }}
      />

      {lpa ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("esim.account.install", "Install")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {tr(
                "esim.account.installHint",
                "Install before you travel while you have Wi-Fi. Scan the QR code from another screen, or tap the link on the phone that will use the eSIM.",
              )}
            </p>
            <div className="flex flex-col gap-6 sm:flex-row">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- a data URL drawn per request; next/image adds nothing
                <img src={qr} alt={tr("esim.account.qrAlt", "eSIM QR code")} width={200} height={200} className="h-[200px] w-[200px] self-center rounded-md border bg-white p-2" />
              ) : null}
              <div className="flex-1 space-y-2">
                {links ? (
                  <div className="flex flex-wrap gap-2">
                    <a href={links.ios} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                      {tr("esim.account.installIos", "Install on iPhone")}
                    </a>
                    <a href={links.android} className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
                      {tr("esim.account.installAndroid", "Install on Android")}
                    </a>
                  </div>
                ) : null}
                {number.install.smdpAddress ? <CopyValue label={tr("esim.account.smdp", "SM-DP+ address")} value={number.install.smdpAddress} /> : null}
                {number.install.matchingId ? <CopyValue label={tr("esim.account.activationCode", "Activation code")} value={number.install.matchingId} /> : null}
                {lpa ? <CopyValue label={tr("esim.account.lpaCode", "Full LPA code")} value={lpa} /> : null}
              </div>
            </div>
            {number.install.pin1 || number.install.puk1 || number.install.pin2 || number.install.puk2 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {number.install.pin1 ? <CopyValue label="PIN1" value={number.install.pin1} /> : null}
                {number.install.puk1 ? <CopyValue label="PUK1" value={number.install.puk1} /> : null}
                {number.install.pin2 ? <CopyValue label="PIN2" value={number.install.pin2} /> : null}
                {number.install.puk2 ? <CopyValue label="PUK2" value={number.install.puk2} /> : null}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {tr("esim.number.pinHint", "Keep the PIN and PUK private: they unlock the number if the phone asks for them.")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.account.details", "Details")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {row(tr("esim.account.orderNumber", "Order"), number.orderNumber)}
          {row("ICCID", number.iccid)}
          {row(tr("esim.number.lastUsed", "Last used"), card?.lastUsedAt ? date.format(card.lastUsedAt) : null)}
          {row(tr("esim.number.validUntil", "Number kept until"), number.validUntil ? date.format(number.validUntil) : null)}
          {row(tr("esim.account.updatedAt", "Last updated"), card?.checkedAt ? dateTime.format(card.checkedAt) : null)}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {tr("esim.number.validHint", "A number stays yours for a year after it was last used. Use it now and then to keep it.")}
      </p>
    </div>
  );
}

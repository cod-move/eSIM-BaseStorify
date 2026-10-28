import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "@/components/language/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { getCustomerEsim } from "@/lib/esim/account/esims";
import { formatBytes, remainingPercent } from "@/lib/esim/account/display";
import { installLinks } from "@/lib/esim/fulfillment/install-links";
import { EsimStatusBadge, UsageBar } from "@/components/esim/esim-status-badge";
import { CancelEsimButton, CopyValue, RefreshUsageButton, RemarkEditor } from "@/components/esim/esim-actions";
import { shopperCancelOffer } from "@/lib/esim/cancel/service";
import { buttonVariants } from "@/components/ui/button";
import { esimTopupStatus } from "@/lib/esim/topup/offers";
import { REFUSAL_TEXT } from "@/lib/esim/topup/eligibility";
import { TOPUP_STATUS_TEXT, listEsimTopups } from "@/lib/esim/topup/history";
import { formatStorePrice } from "@/lib/esim/topup/format";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * One eSIM (USR-02/03/04, TOP-06): how much is left, how to install it, its
 * details, and topping it up with the top-ups bought so far. The QR code is drawn here on the server from the activation code;
 * the page is only ever rendered for the eSIM's owner.
 */
export default async function AccountEsimPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const esim = await getCustomerEsim(session.user.id, id);
  if (!esim) notFound();
  const [topup, topups, cancel] = await Promise.all([esimTopupStatus(session.user.id, id), listEsimTopups(session.user.id, id), shopperCancelOffer(session.user.id, id)]);

  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const code = esim.installation.activationCode;
  const qr = code ? await QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: "M" }) : null;
  const links = installLinks(code);
  const percent = remainingPercent(esim.usage?.totalBytes, esim.usage?.remainingBytes);
  const unlimited = esim.dataType !== "total" && esim.dataType !== "lifetime";
  const vpn = esim.bundles.find((bundle) => bundle.type === "vpn");
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex justify-between gap-4 py-1.5 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-right">{value}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <Link href="/account/esims" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        {tr("esim.account.back", "My eSIMs")}
      </Link>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold sm:text-2xl">
            {esim.emoji ? `${esim.emoji} ` : ""}
            {esim.planName}
          </h1>
          <EsimStatusBadge display={esim.display} label={tr(`esim.status.${esim.display.status}`, esim.display.label)} />
        </div>
        <RemarkEditor esimId={esim.id} remark={esim.remark} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">{tr("esim.account.usage", "Data")}</CardTitle>
          {esim.display.status !== "failed" && esim.display.status !== "issuing" ? <RefreshUsageButton esimId={esim.id} /> : null}
          {cancel?.allowed ? (
            <CancelEsimButton
              esimId={esim.id}
              refund={formatStorePrice(cancel.refundMinor, locale)}
              fee={formatStorePrice(cancel.feeMinor, locale)}
              toBalance={cancel.refundTo === "balance"}
            />
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {percent !== null ? (
            <>
              <UsageBar percent={percent} />
              <div className="flex justify-between text-sm">
                <span>{tr("esim.account.left", "{amount} left", { amount: formatBytes(esim.usage?.remainingBytes) })}</span>
                <span className="text-muted-foreground">
                  {tr("esim.account.ofTotal", "of {amount}", { amount: formatBytes(esim.usage?.totalBytes) })}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {unlimited
                ? tr("esim.account.unlimitedUsage", "Unlimited plan — no total to count down.")
                : tr("esim.account.noUsageYet", "Usage appears once the eSIM is used. Refresh to check.")}
            </p>
          )}
          {row(tr("esim.account.expiresAt", "Valid until"), esim.expiresAt ? dateTime.format(esim.expiresAt) : null)}
          {row(tr("esim.account.updatedAt", "Last updated"), esim.lastUsageUpdateAt ? dateTime.format(esim.lastUsageUpdateAt) : null)}
          {esim.usage?.stale ? (
            <p className="text-xs text-muted-foreground">{tr("esim.account.stale", "The network may report usage with a delay.")}</p>
          ) : null}
        </CardContent>
      </Card>

      {code ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("esim.account.install", "Install")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {esim.display.canInstall ? (
              <p className="text-sm text-muted-foreground">
                {tr(
                  "esim.account.installHint",
                  "Install before you travel while you have Wi-Fi. Scan the QR code from another screen, or tap the link on the phone that will use the eSIM.",
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {tr("esim.account.alreadyInstalled", "This eSIM appears to be installed already. A QR code can usually be installed only once.")}
              </p>
            )}
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
                {esim.installation.smdpAddress ? <CopyValue label={tr("esim.account.smdp", "SM-DP+ address")} value={esim.installation.smdpAddress} /> : null}
                {esim.installation.matchingId ? <CopyValue label={tr("esim.account.activationCode", "Activation code")} value={esim.installation.matchingId} /> : null}
                {esim.installation.apn ? <CopyValue label="APN" value={esim.installation.apn} /> : null}
              </div>
            </div>
            {esim.customerLink ? (
              <a href={esim.customerLink} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                {tr("esim.account.installPage", "Open the supplier's installation page")}
              </a>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {topup?.supported || topups.length ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="text-base">{tr("esim.topup.section", "Top up")}</CardTitle>
            {topup?.eligibility.ok ? (
              <Link href={`/account/esims/${esim.id}/topup`} className={buttonVariants({ size: "sm" })}>
                {tr("esim.topup.cta", "Add data")}
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            {topup && !topup.eligibility.ok && topup.supported ? (
              <p className="text-sm text-muted-foreground">
                {tr(`esim.topup.refusal.${topup.eligibility.reason}`, REFUSAL_TEXT[topup.eligibility.reason])}
              </p>
            ) : null}
            {topup?.eligibility.ok && !topups.length ? (
              <p className="text-sm text-muted-foreground">
                {tr("esim.topup.hint", "Running low? Add data to this eSIM — nothing new to install.")}
              </p>
            ) : null}
            {topups.length ? (
              <div className="divide-y">
                {topups.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
                    <div>
                      <div className="font-medium">{entry.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {date.format(entry.createdAt)} · {tr("esim.account.order", "Order {number}", { number: entry.orderNumber })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div>{formatStorePrice(entry.priceMinor, locale)}</div>
                      <div className={`text-xs ${entry.status === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
                        {tr(`esim.topup.status.${entry.status}`, TOPUP_STATUS_TEXT[entry.status])}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.account.details", "Details")}</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {row(tr("esim.account.orderNumber", "Order"), esim.orderNumber)}
          {row("ICCID", esim.iccid)}
          {row(tr("esim.account.plan", "Plan"), [esim.dataLabel, esim.validityDays ? tr("esim.account.days", "{count} days", { count: esim.validityDays }) : ""].filter(Boolean).join(" · "))}
          {row(tr("esim.account.issuedAt", "Issued"), esim.fulfilledAt ? date.format(esim.fulfilledAt) : null)}
          {row(tr("esim.account.installBefore", "Install before"), esim.display.canInstall && esim.activationDeadline ? date.format(esim.activationDeadline) : null)}
          {row(tr("esim.account.topupBefore", "Top up before"), esim.topupDeadline ? date.format(esim.topupDeadline) : null)}
          {vpn ? row(tr("esim.account.vpn", "VPN included"), [vpn.accountNumber, vpn.expiresAt ? date.format(vpn.expiresAt) : null].filter(Boolean).join(" · ") || "✓") : null}
        </CardContent>
      </Card>
    </div>
  );
}

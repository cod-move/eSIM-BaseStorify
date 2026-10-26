import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "@/components/language/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { getCustomerEsim } from "@/lib/esim/account/esims";
import { topupOffers } from "@/lib/esim/topup/offers";
import { REFUSAL_TEXT } from "@/lib/esim/topup/eligibility";
import { formatBytes } from "@/lib/esim/account/display";
import { EsimTopupPicker } from "@/components/esim/esim-topup-picker";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * Top up one eSIM (TOP-01..03): whether it can be, the supplier's top-ups for
 * it at the store's prices, and how the top-up adds to the plan. Asks the
 * supplier on each visit (cached two minutes per eSIM).
 */
export default async function AccountEsimTopupPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const [esim, result] = await Promise.all([getCustomerEsim(session.user.id, id), topupOffers(session.user.id, id)]);
  if (!esim || !result) notFound();

  const left = esim.usage && esim.usage.totalBytes > 0 ? formatBytes(esim.usage.remainingBytes) : null;
  const howItAdds =
    result.mode === "addon"
      ? tr("esim.topup.addon", "The top-up is a package of its own: its data and days start alongside your current plan.")
      : tr("esim.topup.stack", "The top-up adds to your current plan: more data, and for some plans more days.");

  return (
    <div className="space-y-6">
      <Link href={`/account/esims/${esim.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        {esim.emoji ? `${esim.emoji} ` : ""}
        {esim.planName}
      </Link>

      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.topup.title", "Top up your eSIM")}</h1>
        <p className="text-sm text-muted-foreground">
          {[esim.iccid ? `ICCID ${esim.iccid}` : null, left ? tr("esim.account.left", "{amount} left", { amount: left }) : null].filter(Boolean).join(" · ")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.topup.choose", "Choose a top-up")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!result.eligibility.ok ? (
            <p className="text-sm">{tr(`esim.topup.refusal.${result.eligibility.reason}`, REFUSAL_TEXT[result.eligibility.reason])}</p>
          ) : result.error ? (
            <p className="text-sm text-destructive">
              {tr("esim.topup.supplierDown", "We could not load the top-ups for this eSIM right now. Please try again in a few minutes.")}
            </p>
          ) : result.offers.length === 0 ? (
            <p className="text-sm">{tr("esim.topup.none", "There are no top-ups for this eSIM at the moment.")}</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{howItAdds}</p>
              <EsimTopupPicker esimId={esim.id} offers={result.offers} />
            </>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {tr("esim.topup.note", "Nothing new to install: the top-up goes onto this eSIM. Pay with your balance or any payment method at checkout.")}
      </p>
    </div>
  );
}

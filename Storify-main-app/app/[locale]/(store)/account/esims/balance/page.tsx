import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import Link from "@/components/language/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { storeCreditSummary } from "@/lib/store-credit/store-credit";
import { findWalletProduct } from "@/lib/esim/wallet/product";
import { formatStorePrice } from "@/lib/esim/topup/format";
import { WalletTopupForm } from "@/components/esim/wallet-topup-form";
import { parkedLineCount } from "@/lib/esim/wallet/park";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}

/**
 * The shopper's balance and adding money to it (WAL-01). The balance is
 * Storify's store credit, spent at checkout (WAL-03); its history is on the
 * store-credit page (WAL-04).
 */
export default async function AccountBalancePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const fromCheckout = (await searchParams).from === "checkout";
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const [balances, settings, product, parked] = await Promise.all([
    storeCreditSummary(session.user.id),
    getEsimSettings(),
    findWalletProduct(),
    parkedLineCount(session.user.id),
  ]);
  const balance = balances.find((entry) => entry.currency === "USD")?.balance ?? 0;
  const wallet = settings.wallet;

  return (
    <div className="space-y-6">
      <Link
        href={fromCheckout ? "/checkout" : "/account/esims"}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {fromCheckout ? tr("esim.wallet.backToCheckout", "Back to checkout") : tr("esim.account.back", "My eSIMs")}
      </Link>
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.wallet.title", "Balance")}</h1>
        <p className="text-3xl font-bold">{formatStorePrice(Math.round(balance * 100), locale)}</p>
        <Link href="/account/store-credit" className="text-sm text-primary hover:underline">
          {tr("esim.wallet.history", "See every change")}
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("esim.wallet.add", "Add money")}</CardTitle>
        </CardHeader>
        <CardContent>
          {wallet?.enabled && product ? (
            <WalletTopupForm
              product={product}
              minMinor={wallet.minMinor}
              maxMinor={wallet.maxMinor}
              fee={{ feeFixedMinor: wallet.feeFixedMinor, feePercent: wallet.feePercent }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{tr("esim.wallet.unavailable", "Adding money to your balance is not available at the moment.")}</p>
          )}
        </CardContent>
      </Card>
      {fromCheckout || parked > 0 ? (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          {parked > 0
            ? tr("esim.wallet.parked", "{count} items from your cart are kept aside while you add money. They go back to your cart once it is paid, or when you return to checkout.", { count: parked })
            : tr("esim.wallet.parkNote", "Adding money is paid on its own. The items in your cart are kept aside meanwhile and go back to your cart afterwards.")}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {tr("esim.wallet.note", "Your balance is used at checkout for eSIMs and top-ups. Money added to your balance is not refunded to your card.")}
      </p>
    </div>
  );
}

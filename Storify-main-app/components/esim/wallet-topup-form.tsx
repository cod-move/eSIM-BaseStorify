"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast-notification";
import { useCart } from "@/hooks/use-cart";
import { useRouter } from "@/hooks/use-locale-navigation";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useCurrency } from "@/providers/currency-provider";
import { walletFeeMinor, type WalletFeeSettings } from "@/lib/esim/wallet/booking";

interface Props {
  product: { productId: string; variantId: string };
  minMinor: number;
  maxMinor: number;
  fee: WalletFeeSettings;
}

const PRESETS = [1000, 2000, 5000, 10_000];

/**
 * Add money to the balance (WAL-01): choose an amount, see the fee and what
 * is paid, and go to checkout. The server prices the line again; what is
 * shown here is only the preview. The top-up is checked out on its own, so
 * the cart's other lines are set aside first and come back after it.
 */
export function WalletTopupForm({ product, minMinor, maxMinor, fee }: Props) {
  const t = useFallbackTranslator(useTranslations());
  const router = useRouter();
  const { addItem, refreshCart } = useCart();
  const { formatPrice } = useCurrency();
  const presets = PRESETS.filter((value) => value >= minMinor && value <= maxMinor);
  const [text, setText] = useState(((presets[1] ?? presets[0] ?? minMinor) / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const amountMinor = Math.round(Number(text) * 100);
  const valid = Number.isFinite(amountMinor) && amountMinor >= minMinor && amountMinor <= maxMinor;
  const feeMinor = useMemo(() => (valid ? walletFeeMinor(amountMinor, fee) : 0), [valid, amountMinor, fee]);

  async function buy() {
    if (!valid) return;
    setBusy(true);
    try {
      const parked = await fetch("/api/esim/me/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "park" }),
      });
      if (!parked.ok) throw new Error(t("esim.wallet.failed", "Could not start the top-up"));
      await refreshCart(true);
      await addItem({
        productId: product.productId,
        variantId: product.variantId,
        quantity: 1,
        price: (amountMinor + feeMinor) / 100,
        name: t("esim.wallet.lineName", "Wallet top-up"),
        lineAttributes: { wallet: amountMinor },
      });
      router.push("/checkout");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("esim.wallet.failed", "Could not start the top-up"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {presets.length ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((value) => (
            <Button key={value} type="button" variant={amountMinor === value ? "default" : "outline"} size="sm" onClick={() => setText((value / 100).toFixed(2))}>
              {formatPrice(value / 100)}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="max-w-xs space-y-1.5">
        <Label htmlFor="wallet-amount">{t("esim.wallet.amount", "Amount to add")}</Label>
        <Input id="wallet-amount" type="number" inputMode="decimal" min={minMinor / 100} max={maxMinor / 100} step="0.01" value={text} onChange={(event) => setText(event.target.value)} />
        <p className="text-xs text-muted-foreground">
          {t("esim.wallet.range", "Between {min} and {max}", { min: formatPrice(minMinor / 100), max: formatPrice(maxMinor / 100) })}
        </p>
      </div>
      <div className="max-w-xs space-y-1 rounded-lg border p-3 text-sm">
        <div className="flex justify-between"><span>{t("esim.wallet.added", "Added to your balance")}</span><span>{valid ? formatPrice(amountMinor / 100) : "—"}</span></div>
        <div className="flex justify-between text-muted-foreground"><span>{t("esim.wallet.fee", "Fee")}</span><span>{valid ? formatPrice(feeMinor / 100) : "—"}</span></div>
        <div className="flex justify-between font-semibold"><span>{t("esim.wallet.pay", "You pay")}</span><span>{valid ? formatPrice((amountMinor + feeMinor) / 100) : "—"}</span></div>
      </div>
      <Button size="lg" onClick={buy} disabled={!valid || busy}>
        {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
        {t("esim.wallet.checkout", "Continue to checkout")}
      </Button>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import Link from "@/components/language/link";
import { useCartActions } from "@/hooks/use-cart";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";

/**
 * The balance as a payment method at checkout (WAL-03, patch P27): what the
 * checkout needs to know from the eSIM module, and the "Top up" link.
 */

export interface EsimCheckoutBalance {
  /** Adding money to the balance is switched on. */
  walletEnabled: boolean;
  /** The cart is a wallet top-up, which the balance never pays. */
  walletCart: boolean;
}

/**
 * Puts back cart lines set aside for a top-up the shopper did not finish,
 * and says whether this cart is a top-up. Asked again when the cart changes.
 */
export function useEsimCheckoutBalance(signedIn: boolean, itemCount: number): EsimCheckoutBalance {
  const { refreshCart } = useCartActions();
  const [state, setState] = useState<EsimCheckoutBalance>({ walletEnabled: false, walletCart: false });
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/esim/me/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore" }) })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.success) return;
        setState({ walletEnabled: Boolean(data.data.walletEnabled), walletCart: Boolean(data.data.walletCart) });
        if (data.data.moved > 0) void refreshCart(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [signedIn, itemCount, refreshCart]);
  return state;
}

/** The balance row's words, for the checkout's list of methods. */
export function useEsimBalanceText() {
  const t = useFallbackTranslator(useTranslations());
  return useMemo(() => ({
    label: t("esim.wallet.method", "Account balance"),
    available: (amount: string) => t("esim.wallet.available", "{amount} available", { amount }),
    short: (amount: string) => t("esim.wallet.short", "Not enough balance: {amount} available", { amount }),
    covers: t("esim.wallet.covers", "Your balance pays for this order — nothing else to pay."),
  }), [t]);
}

/** "Top up": to the balance page, which sets the cart aside and comes back here. */
export function EsimBalanceTopupLink() {
  const t = useFallbackTranslator(useTranslations());
  return (
    <Link
      href="/account/esims/balance?from=checkout"
      onClick={(event) => event.stopPropagation()}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:border-primary hover:text-primary"
    >
      <Plus className="h-3.5 w-3.5" />
      {t("esim.wallet.topUp", "Top up")}
    </Link>
  );
}

/**
 * Whether the cart is eSIM-only (patch P28): checkout then asks for no
 * address, as the server allows. False until known, so the form stays as is.
 */
export function useEsimOnlyCart(productIds: readonly string[]): boolean {
  const key = [...new Set(productIds)].sort().join(",");
  const [answer, setAnswer] = useState<{ key: string; esimOnly: boolean }>({ key: "", esimOnly: false });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    fetch(`/api/esim/catalog/esim-only?ids=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.success) setAnswer({ key, esimOnly: Boolean(data.data.esimOnly) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return answer.key === key && answer.esimOnly;
}

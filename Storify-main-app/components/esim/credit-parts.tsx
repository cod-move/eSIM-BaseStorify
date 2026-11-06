"use client";

import { useLocale, useTranslations } from "next-intl";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { formatCurrency } from "@/lib/intl/money";
import { resolveCurrency } from "@/lib/intl/currencies";
import type { CreditKind, CreditPart } from "@/lib/esim/wallet/credit-parts";

/**
 * The balance by where it came from (patch P38, lib/esim/wallet/credit-parts.ts):
 * under the balance, only what of it expires ("Of which gift credit: $10,
 * expires 31 Dec 2026"; the rest never does), and the small tags on each
 * history row.
 */

function money(amount: number, currencyCode: string) {
  const currency = resolveCurrency(String(currencyCode || "").toUpperCase() || "USD");
  return formatCurrency(Number(amount || 0), currency.code, currency.locale);
}

function useKindLabel() {
  const t = useFallbackTranslator(useTranslations());
  return (kind: CreditKind) =>
    kind === "topup"
      ? t("esim.wallet.partTopup", "Topped up")
      : kind === "refund"
        ? t("esim.wallet.partRefund", "Refund")
        : t("esim.wallet.partGift", "Gift");
}

export function CreditPartsLine({ parts, currency, className }: { parts: CreditPart[]; currency: string; className?: string }) {
  const t = useFallbackTranslator(useTranslations());
  const locale = useLocale();
  const expiring = parts.filter((part) => part.nextExpiry);
  if (!expiring.length) return null;
  const date = (value: string) => new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const line = (part: CreditPart) => {
    const values = { amount: money(part.nextExpiry!.amount, currency), date: date(part.nextExpiry!.expiresAt) };
    if (part.kind === "topup") return t("esim.wallet.expiringTopup", "Of which topped-up credit: {amount} (expires {date})", values);
    if (part.kind === "refund") return t("esim.wallet.expiringRefund", "Of which refund credit: {amount} (expires {date})", values);
    return t("esim.wallet.expiringGift", "Of which gift credit: {amount} (expires {date})", values);
  };
  return (
    <div className={className ?? "space-y-0.5 text-sm text-muted-foreground"}>
      {expiring.map((part) => (
        <p key={part.kind}>{line(part)}</p>
      ))}
    </div>
  );
}

export function CreditKindTags({ kinds, currency }: { kinds: Array<{ kind: CreditKind; amount: number }>; currency: string }) {
  const label = useKindLabel();
  if (!kinds.length) return null;
  const tone = (kind: CreditKind) =>
    kind === "topup"
      ? "bg-primary/10 text-primary"
      : kind === "refund"
        ? "bg-muted text-muted-foreground"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {kinds.map((entry) => (
        <span key={entry.kind} className={`rounded px-1.5 py-0.5 text-[11px] font-medium leading-none ${tone(entry.kind)}`}>
          {label(entry.kind)}
          {kinds.length > 1 ? ` ${money(entry.amount, currency)}` : ""}
        </span>
      ))}
    </span>
  );
}

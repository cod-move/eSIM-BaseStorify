"use client";

import { useLocale, useTranslations } from "next-intl";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { formatCurrency } from "@/lib/intl/money";
import { resolveCurrency } from "@/lib/intl/currencies";
import type { CreditKind, CreditPart } from "@/lib/esim/wallet/credit-parts";

/**
 * The balance by where it came from (patch P38, lib/esim/wallet/credit-parts.ts):
 * "Topped up $20 (never expires) + Gift $10 (expires 31 Dec 2026)", and the
 * small tags on each history row.
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
  const label = useKindLabel();
  if (!parts.length) return null;
  const date = (value: string) => new Date(value).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const text = parts
    .map((part) =>
      t("esim.wallet.part", "{label} {amount} ({expiry})", {
        label: label(part.kind),
        amount: money(part.amount, currency),
        expiry: !part.nextExpiry
          ? t("esim.wallet.partNeverExpires", "never expires")
          : part.nextExpiry.amount >= part.amount
            ? t("esim.wallet.partExpires", "expires {date}", { date: date(part.nextExpiry.expiresAt) })
            : t("esim.wallet.partSomeExpire", "{amount} of it expires {date}", { amount: money(part.nextExpiry.amount, currency), date: date(part.nextExpiry.expiresAt) }),
      }),
    )
    .join(" + ");
  return <p className={className ?? "text-sm text-muted-foreground"}>{text}</p>;
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

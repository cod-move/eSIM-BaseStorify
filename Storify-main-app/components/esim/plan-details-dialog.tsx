"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, CalendarDays, Database, Globe2, Loader2, MapPin, PlugZap, RefreshCw, Shield, Signal, Wifi, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WishlistButton } from "@/components/products/wishlist-button";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import type { StorefrontVariant } from "@/lib/esim/storefront/selector";
import type { CoveredCountry } from "@/lib/esim/storefront/compare";
import { Flag } from "@/components/esim/flag";

/**
 * A plan card opened (WEB-14): everything the card leaves out — how the data
 * runs, when the plan starts and the last day to install it, speed, hotspot,
 * exit IP, the top-up rules, what comes with it and the coverage — with the
 * card's wishlist heart and "Buy now". A fact the supplier does not give is
 * left out, not guessed.
 */

const SHOWN_FLAGS = 6;

export interface PlanCardLabels {
  kind: string;
  days: string;
  ip: string;
  topup: string;
  topupRules: string[];
  coverage: string;
}

export function PlanDetailsDialog({
  variant,
  onClose,
  productId,
  labels,
  price,
  coverage,
  onCoverage,
  onBuy,
  buying,
}: {
  variant: StorefrontVariant | null;
  onClose: () => void;
  productId: string;
  labels: PlanCardLabels | null;
  price: ReactNode;
  coverage: CoveredCountry[];
  onCoverage: () => void;
  onBuy: () => void;
  buying: boolean;
}) {
  const t = useFallbackTranslator(useTranslations());
  if (!variant || !labels) return null;
  const details = variant.details ?? null;

  const dataLine =
    {
      total: t("esim.details.dataTotal", "A fixed amount of data for the whole trip"),
      unlimited: t("esim.details.dataUnlimited", "Unlimited data"),
      daily_throttled: t("esim.details.dataDailyThrottled", "A daily allowance, then reduced speed"),
      daily_cutoff: t("esim.details.dataDailyCutoff", "A daily allowance, renewed each day"),
      lifetime: t("esim.details.dataLifetime", "Data that does not expire"),
    }[variant.dataType] ?? "";
  // The supplier's own allowance says more than the kind's general line.
  const reduced = details?.reducedSpeedMbps
    ? details.reducedSpeedMbps < 1
      ? `${Math.round(details.reducedSpeedMbps * 1000)} Kbps`
      : `${details.reducedSpeedMbps} Mbps`
    : null;
  // Suppliers give 500 MB as 0.49 GB.
  const allowance = details?.highSpeedGbPerDay
    ? details.highSpeedGbPerDay < 1
      ? `${Math.round((details.highSpeedGbPerDay * 1024) / 10) * 10} MB`
      : `${details.highSpeedGbPerDay} GB`
    : null;
  const fairUse = allowance
    ? reduced
      ? t("esim.plans.fairUse", "{amount} a day at full speed, then {speed}.", { amount: allowance, speed: reduced })
      : t("esim.plans.fairUseOnly", "{amount} a day at full speed.", { amount: allowance })
    : null;
  const starts = details?.billingStarts
    ? {
        first_connection: t("esim.details.startConnection", "The plan starts when the eSIM first connects at your destination."),
        first_installation: t("esim.details.startInstall", "The plan starts when you install the eSIM."),
        on_purchase: t("esim.details.startPurchase", "The plan starts at purchase."),
      }[details.billingStarts]
    : null;
  const extras = [
    details?.vpn ? t("esim.details.vpn", "A free VPN") : null,
    details?.voiceMinutes ? t("esim.plans.voiceMinutes", "{count} minutes of calls", { count: details.voiceMinutes }) : null,
    details?.smsCount ? t("esim.plans.smsCount", "{count} texts", { count: details.smsCount }) : null,
  ].filter(Boolean);

  const rows: Array<{ icon: LucideIcon; label: string; body: ReactNode }> = [
    { icon: Database, label: t("esim.details.data", "Data"), body: fairUse ?? dataLine },
    { icon: CalendarDays, label: t("esim.plans.validity", "Validity"), body: labels.days },
    ...(starts ? [{ icon: PlugZap, label: t("esim.plans.activation", "Activation"), body: starts }] : []),
    ...(details?.installWithinDays
      ? [
          {
            icon: CalendarClock,
            label: t("esim.plans.installBy", "Install by"),
            body: t("esim.details.installWithin", "Install it within {days} days of purchase.", { days: details.installWithinDays }),
          },
        ]
      : []),
    ...(details?.speed ? [{ icon: Signal, label: t("esim.details.speed", "Speed"), body: t("esim.details.upTo", "Up to {speed}", { speed: details.speed }) }] : []),
    ...(details?.hotspot === true || details?.hotspot === false
      ? [
          {
            icon: Wifi,
            label: t("esim.details.hotspot", "Hotspot"),
            body: details.hotspot
              ? t("esim.details.hotspotYes", "Share your connection with other devices.")
              : t("esim.details.hotspotNo", "Sharing the connection is not allowed."),
          },
        ]
      : []),
    { icon: Globe2, label: t("esim.details.ip", "IP address"), body: labels.ip },
    {
      icon: RefreshCw,
      label: t("esim.details.topup", "Top-up"),
      body: (
        <>
          <span className="text-foreground">{labels.topup}</span>
          <ul className="mt-1 list-disc space-y-0.5 ps-4">
            {labels.topupRules.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ),
    },
    ...(extras.length ? [{ icon: Shield, label: t("esim.details.extras", "Included"), body: extras.join(" · ") }] : []),
    {
      icon: MapPin,
      label: t("esim.details.coverage", "Coverage"),
      body: (
        <button type="button" onClick={onCoverage} className="flex min-w-0 flex-wrap items-center gap-1.5 text-start text-store-link underline-offset-2 hover:underline">
          <span className="flex items-center gap-1">
            {coverage.slice(0, SHOWN_FLAGS).map((country) => (
              <Flag key={country.code} code={country.code} />
            ))}
          </span>
          {labels.coverage}
        </button>
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="space-y-1 border-b p-5 pe-12 text-start">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl">{variant.dataValue}</DialogTitle>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{labels.kind}</span>
          </div>
          <DialogDescription>{labels.days}</DialogDescription>
        </DialogHeader>

        <dl className="divide-y px-5">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-3 py-3 text-sm">
              <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <dt className="w-24 shrink-0 font-medium">{row.label}</dt>
              <dd className="min-w-0 flex-1 text-muted-foreground">{row.body}</dd>
            </div>
          ))}
        </dl>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-background p-4">
          <div className="min-w-0">{price}</div>
          <div className="flex shrink-0 items-center gap-2">
            <WishlistButton productId={productId} size="md" className="shadow-none" />
            <Button onClick={onBuy} disabled={buying}>
              {buying ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
              {t("esim.selector.buyNow", "Buy now")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

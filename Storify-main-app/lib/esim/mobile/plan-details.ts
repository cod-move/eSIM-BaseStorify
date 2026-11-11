import { EsimPlanDetails } from "@/contracts/mobile/shop/v1/esim";
import { MobileApiError } from "@/lib/api-core/errors";
import { defineRoute } from "@/lib/api-core/registry";
import { toMoney } from "@/lib/api-core/shop/money";
import { connectDB } from "@/lib/db";
import { getStoreCurrency } from "@/lib/intl/server-currency";
import { regionNamesFor } from "@/lib/esim/storefront/catalog";
import { coverageByCountry } from "@/lib/esim/storefront/compare";
import { getLocalizedDestination } from "@/lib/esim/storefront/destination-names";
import { dataKindOf } from "@/lib/esim/storefront/plan-filter";
import type { StorefrontVariant } from "@/lib/esim/storefront/selector";
import { translator } from "@/lib/esim/i18n/server";

/**
 * One plan explained for the shopper app (APP-02): the rows of the website's
 * plan details (components/esim/plan-details-dialog.tsx, labels as in
 * components/esim/plan-browser.tsx), worded on the server in the shopper's
 * language, and the countries the plan works in.
 */

type Translate = Awaited<ReturnType<typeof translator>>;
type Row = EsimPlanDetails["rows"][number];

const KIND_KEYS: Record<string, [string, string]> = {
  total: ["esim.plans.kindTotal", "Total data"],
  daily: ["esim.plans.kindDaily", "Daily data"],
  unlimited: ["esim.plans.kindUnlimited", "Unlimited"],
  lifetime: ["esim.plans.kindLifetime", "Long-term"],
};

function daysLabel(variant: StorefrontVariant, t: Translate): string {
  if (variant.perDay) return t("esim.compare.flexDays", "{min}–{max} days", { min: variant.perDay.minDays, max: variant.perDay.maxDays });
  return variant.days === 1 ? t("esim.selector.oneDay", "1 day") : t("esim.selector.nDays", "{days} days", { days: variant.days ?? 0 });
}

function topupLabel(mode: string, t: Translate): string {
  if (mode === "stack") return t("esim.selector.topupStack", "Top up this plan");
  if (mode === "addon") return t("esim.selector.topupAddon", "Add more packages");
  return t("esim.selector.topupNone", "No top-up");
}

function topupRules(variant: StorefrontVariant, t: Translate): string[] {
  if (variant.topupMode === "none") return [t("esim.plans.ruleNone", "This plan cannot be topped up. If you need more, buy another plan.")];
  const rule = variant.topupRule;
  const lines: string[] = [];
  if (variant.topupMode === "addon") lines.push(t("esim.plans.ruleAddon", "Each top-up is a separate package with its own data and validity."));
  else if (rule?.stackTarget === "data") lines.push(t("esim.plans.ruleStackData", "A top-up adds data to this plan; the end date stays the same."));
  else if (rule?.stackTarget === "days") lines.push(t("esim.plans.ruleStackDays", "A top-up extends this plan's validity."));
  else if (rule?.stackTarget === "data_and_days") lines.push(t("esim.plans.ruleStackBoth", "A top-up adds data and extends the validity of this plan."));
  else lines.push(t("esim.plans.ruleStack", "A top-up is added onto this plan."));
  if (rule?.window === "before_expiry") lines.push(t("esim.plans.ruleBeforeExpiry", "Top up before the plan expires; once it has expired, the eSIM can no longer be topped up."));
  if (rule?.window === "while_profile_exists") lines.push(t("esim.plans.ruleAnyTime", "You can top up at any time, even after the current package runs out."));
  if (rule?.retentionDays) lines.push(t("esim.plans.ruleRetention", "If no package is active for {days} days, the network removes the eSIM.", { days: rule.retentionDays }));
  lines.push(t("esim.plans.ruleWhere", "Top up from My eSIMs, on the same eSIM — no new install."));
  return lines;
}

function dataText(variant: StorefrontVariant, t: Translate): string {
  const details = variant.details ?? null;
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
  if (allowance) {
    return reduced
      ? t("esim.plans.fairUse", "{amount} a day at full speed, then {speed}.", { amount: allowance, speed: reduced })
      : t("esim.plans.fairUseOnly", "{amount} a day at full speed.", { amount: allowance });
  }
  return (
    {
      total: t("esim.details.dataTotal", "A fixed amount of data for the whole trip"),
      unlimited: t("esim.details.dataUnlimited", "Unlimited data"),
      daily_throttled: t("esim.details.dataDailyThrottled", "A daily allowance, then reduced speed"),
      daily_cutoff: t("esim.details.dataDailyCutoff", "A daily allowance, renewed each day"),
      lifetime: t("esim.details.dataLifetime", "Data that does not expire"),
    } as Record<string, string>
  )[variant.dataType] ?? "";
}

/** GET /esim/destinations/{scope}/{slug}/plans/{variantId} */
export const esimPlanDetailsRoute = defineRoute({
  id: "esim.destinations.plan",
  method: "GET",
  path: "/esim/destinations/{scope}/{slug}/plans/{variantId}",
  auth: "none",
  cache: { kind: "public", sMaxAge: 300, swr: 600 },
  rateLimit: { bucket: "catalog:esim-destination", preset: "browse" },
  output: EsimPlanDetails,
  handler: async ({ params, locale }) => {
    if (params.scope !== "local" && params.scope !== "multi") throw new MobileApiError(404, "NOT_FOUND", "Plan not found.");
    await connectDB();
    const [destination, currency, t] = await Promise.all([getLocalizedDestination(params.slug, params.scope, locale), getStoreCurrency(), translator(locale)]);
    const variant = destination?.variants.find((entry) => entry.variantId === params.variantId);
    if (!destination || !variant) throw new MobileApiError(404, "NOT_FOUND", "Plan not found.");

    const countryCodes = destination.countries.map((country) => country.code);
    const regionNames = regionNamesFor(destination, locale);
    const set = variant.coverageSet !== undefined ? destination.coverageSets?.[variant.coverageSet] : undefined;
    const coverage = set ? coverageByCountry(set.countries, set.networks, locale) : coverageByCountry(destination.countries, destination.networks, locale);
    const codes = [...variant.breakoutIp].sort();
    const ip = !codes.length
      ? t("esim.selector.ipUnknown", "Not specified")
      : countryCodes.length === 1 && codes.length === 1 && codes[0] === countryCodes[0]
        ? t("esim.selector.ipLocal", "Local IP")
        : codes.map((code) => regionNames[code] ?? code).join(", ");
    const details = variant.details ?? null;
    const starts = details?.billingStarts
      ? ({
          first_connection: t("esim.details.startConnection", "The plan starts when the eSIM first connects at your destination."),
          first_installation: t("esim.details.startInstall", "The plan starts when you install the eSIM."),
          on_purchase: t("esim.details.startPurchase", "The plan starts at purchase."),
        } as Record<string, string>)[details.billingStarts]
      : undefined;
    const extras = [
      details?.vpn ? t("esim.details.vpn", "A free VPN") : null,
      details?.voiceMinutes ? t("esim.plans.voiceMinutes", "{count} minutes of calls", { count: details.voiceMinutes }) : null,
      details?.smsCount ? t("esim.plans.smsCount", "{count} texts", { count: details.smsCount }) : null,
    ].filter((entry): entry is string => Boolean(entry));
    const days = daysLabel(variant, t);

    const rows: Row[] = [
      { key: "data", label: t("esim.details.data", "Data"), text: dataText(variant, t) },
      { key: "validity", label: t("esim.plans.validity", "Validity"), text: days },
      ...(starts ? [{ key: "activation", label: t("esim.plans.activation", "Activation"), text: starts }] : []),
      ...(details?.installWithinDays
        ? [{ key: "installBy", label: t("esim.plans.installBy", "Install by"), text: t("esim.details.installWithin", "Install it within {days} days of purchase.", { days: details.installWithinDays }) }]
        : []),
      ...(details?.speed ? [{ key: "speed", label: t("esim.details.speed", "Speed"), text: t("esim.details.upTo", "Up to {speed}", { speed: details.speed }) }] : []),
      ...(details?.hotspot === true || details?.hotspot === false
        ? [
            {
              key: "hotspot",
              label: t("esim.details.hotspot", "Hotspot"),
              text: details.hotspot ? t("esim.details.hotspotYes", "Share your connection with other devices.") : t("esim.details.hotspotNo", "Sharing the connection is not allowed."),
            },
          ]
        : []),
      { key: "ip", label: t("esim.details.ip", "IP address"), text: ip },
      { key: "topup", label: t("esim.details.topup", "Top-up"), text: topupLabel(variant.topupMode, t), lines: topupRules(variant, t) },
      ...(extras.length ? [{ key: "extras", label: t("esim.details.extras", "Included"), text: extras.join(" · ") }] : []),
      {
        key: "coverage",
        label: t("esim.details.coverage", "Coverage"),
        text: coverage.length < 2 ? t("esim.plans.networks", "Networks") : t("esim.plans.countries", "{count} countries", { count: coverage.length }),
        note: t("esim.details.coverageNote", "This plan only works in the countries and regions it covers. Please check before you buy."),
      },
    ];
    const [kindKey, kindFallback] = KIND_KEYS[dataKindOf(variant)] ?? ["", dataKindOf(variant)];

    return {
      variantId: variant.variantId,
      title: variant.dataValue,
      kind: kindKey ? t(kindKey, kindFallback) : kindFallback,
      days,
      price: toMoney(variant.priceMinor / 100, currency),
      rows,
      coverage: coverage.map((country) => ({
        code: country.code,
        name: country.name,
        operators: country.operators.map((entry) => ({ operator: entry.operator, ...(entry.network ? { network: entry.network } : {}) })),
      })),
    };
  },
});

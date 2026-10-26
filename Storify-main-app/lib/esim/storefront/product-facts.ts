import type { BillingStart, CoverageScope, DataType, TopupMode } from "@/lib/esim/providers/types";

/**
 * What every eSIM plan of a product has in common, and where they differ
 * (WEB-34). Pure: the product page's eSIM block draws it, a test checks it.
 * A fact the plans disagree on is reported as the set of values, so the page
 * can say "depends on the plan" rather than promise one of them.
 */

export interface FactPlan {
  scope: CoverageScope;
  countries: Array<{ code: string; name: string }>;
  networks: Array<{ countryCode: string; operator: string; network: string | null }>;
  breakoutIp: string[];
  dataType: DataType;
  speed: string[];
  tethering: boolean | null;
  billingStarts: BillingStart | null;
  preInstallDays: number | null;
  topupMode: TopupMode;
  vpn: boolean;
  voiceMinutes: number;
  smsCount: number;
}

export interface ProductFacts {
  scope: CoverageScope;
  countries: Array<{ code: string; name: string }>;
  /** Operators by country, with the best network generation each was seen on. */
  networks: Array<{ countryCode: string; operator: string; network: string | null }>;
  /** The fastest generation any plan offers ("5G", "4G"…), when known. */
  topSpeed: string | null;
  dataTypes: DataType[];
  /** true / false when every plan agrees; null when they differ or nobody says. */
  hotspot: boolean | null;
  billingStarts: BillingStart[];
  /** The shortest install window any plan gives, in days. */
  installWithinDays: number | null;
  topupModes: TopupMode[];
  vpn: "all" | "some" | "none";
  voice: boolean;
  sms: boolean;
  breakoutIp: string[];
}

const GENERATIONS = ["5G", "4G", "LTE", "3G", "2G"];

function rank(network: string | null | undefined): number {
  if (!network) return GENERATIONS.length;
  const index = GENERATIONS.findIndex((generation) => network.toUpperCase().includes(generation));
  return index === -1 ? GENERATIONS.length : index;
}

const unique = <T,>(values: T[]) => [...new Set(values)];

export function summarizeFacts(plans: FactPlan[]): ProductFacts | null {
  if (!plans.length) return null;
  const countries = new Map<string, string>();
  const networks = new Map<string, { countryCode: string; operator: string; network: string | null }>();
  for (const plan of plans) {
    for (const country of plan.countries) countries.set(country.code, country.name);
    for (const network of plan.networks) {
      const key = `${network.countryCode}|${network.operator.toLowerCase()}`;
      const known = networks.get(key);
      if (!known || rank(network.network) < rank(known.network)) networks.set(key, network);
    }
  }
  const speeds = plans.flatMap((plan) => [...plan.speed, ...plan.networks.map((network) => network.network ?? "")]);
  const best = speeds.filter(Boolean).sort((a, b) => rank(a) - rank(b))[0] ?? null;
  const hotspot = unique(plans.map((plan) => plan.tethering));
  const vpnCount = plans.filter((plan) => plan.vpn).length;
  const windows = plans.map((plan) => plan.preInstallDays).filter((days): days is number => typeof days === "number" && days > 0);
  const scopes = unique(plans.map((plan) => plan.scope));
  return {
    scope: scopes.includes("global") ? "global" : scopes.includes("regional") ? "regional" : "local",
    countries: [...countries].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name)),
    networks: [...networks.values()].sort((a, b) => a.countryCode.localeCompare(b.countryCode) || a.operator.localeCompare(b.operator)),
    topSpeed: best ? GENERATIONS.find((generation) => best.toUpperCase().includes(generation)) ?? best : null,
    dataTypes: unique(plans.map((plan) => plan.dataType)),
    hotspot: hotspot.length === 1 ? hotspot[0] : null,
    billingStarts: unique(plans.map((plan) => plan.billingStarts).filter((value): value is BillingStart => value !== null)),
    installWithinDays: windows.length ? Math.min(...windows) : null,
    topupModes: unique(plans.map((plan) => plan.topupMode)),
    vpn: vpnCount === 0 ? "none" : vpnCount === plans.length ? "all" : "some",
    voice: plans.some((plan) => plan.voiceMinutes > 0),
    sms: plans.some((plan) => plan.smsCount > 0),
    breakoutIp: unique(plans.flatMap((plan) => plan.breakoutIp)).sort(),
  };
}

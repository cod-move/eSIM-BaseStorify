import "server-only";

import { mongoose } from "@/lib/db";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { EsimTopupQuote, type IEsimTopupQuote } from "@/models/esim-topup-quote.model";
import type { IEsimProfile } from "@/models/esim-profile.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { findOwnedEsim } from "@/lib/esim/account/esims";
import { loadPricing } from "@/lib/esim/pricing/reprice";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import { priceOf } from "@/lib/esim/pricing/price";
import { ProviderError, type Money, type ProviderTopupPlan } from "@/lib/esim/providers/types";
import { TopupError, forDays } from "@/lib/esim/topup/days";
import { topupEligibility, type Eligibility } from "@/lib/esim/topup/eligibility";
import { findTopupProduct, type TopupProductRef } from "@/lib/esim/topup/product";
import { topupLineLabel } from "@/lib/esim/topup/label";
import { renewsOwnPlan } from "@/lib/esim/topup/area";
import { bnesimAreaKey, topupArea, areaIndex } from "@/lib/esim/providers/bnesim";

/**
 * What a shopper can top up an eSIM with (TOP-01/02), and the quote a chosen
 * top-up becomes (TOP-03).
 *
 * Offers come from the eSIM's own supplier (`listTopupPlans`), priced from
 * their cost by the same rules as plans: exchange rate × (1 + buffer), the
 * markup rule matching the eSIM's plan, the margin floor and the rounding.
 * Choosing one asks the supplier again, so a quote is only ever written for
 * a top-up the supplier still offers for that eSIM.
 */

export { TopupError };

export interface TopupOffer {
  topupPlanId: string;
  name: string;
  megabytes: number;
  validityDays: number;
  priceMinor: number;
  /** Where it works, when the eSIM can be topped up for other areas too. */
  area: string | null;
  /** Renews the eSIM's own plan (always, unless it tops up any area); else a plan for another area. */
  sameArea: boolean;
  /** Offers sharing it are one package for different day counts. */
  dayGroup: string | null;
  /** Its area's id in `otherAreas` (null when it renews the own plan). */
  areaId: string | null;
  /**
   * A day pass taken for the days the shopper picks: `priceMinor` here is its
   * price per day; the offer's own price and days are for `defaultDays`.
   */
  perDay: { priceMinor: number; minDays: number; maxDays: number; defaultDays: number } | null;
}

/** An area with top-ups other than renewing the own plan: its offers are fetched when chosen. */
export interface TopupArea {
  id: string;
  name: string;
  /** Distinct packages (a day-pass counts once). */
  count: number;
  fromPriceMinor: number;
}

export interface TopupOffers {
  eligibility: Eligibility;
  mode: "stack" | "addon" | null;
  /**
   * Renewals of the own plan; or, when an area was asked for, that area's
   * top-ups. Plans for other areas are not listed (RoamWifi has thousands):
   * `otherAreas` names them, and each is asked for on its own.
   */
  offers: TopupOffer[];
  otherAreas: TopupArea[];
  /** The supplier could not be asked; the page says so and offers a retry. */
  error?: string;
}

type Owned = { profile: IEsimProfile; plan: IEsimPlan; provider: NonNullable<Awaited<ReturnType<typeof providerOf>>> | null };

async function providerOf(code: string) {
  return EsimProvider.findOne({ code, status: "active" }).select("+secretCredentials");
}

async function owned(userId: string, esimId: string): Promise<Owned | null> {
  const profile = await findOwnedEsim(userId, esimId);
  if (!profile) return null;
  // A plan removed from the library leaves the eSIM without a top-up rule: it simply takes none.
  const plan =
    (await EsimPlan.findById(profile.plan).lean<IEsimPlan | null>()) ??
    ({
      _id: profile.plan,
      providerCode: profile.providerCode,
      coverage: { scope: "local", countries: [], networks: [], breakoutIp: [] },
      topup: { supported: false, type: null, mode: "none", stackTarget: null, window: null, coverage: null, profileRetentionDays: null },
    } as unknown as IEsimPlan);
  return { profile, plan, provider: await providerOf(profile.providerCode) };
}

function eligibilityOf({ profile, plan, provider }: Owned): Eligibility {
  let sells = false;
  try {
    sells = Boolean(provider && adapterFor(provider).capabilities.topup);
  } catch {
    sells = false;
  }
  return topupEligibility({
    rule: plan.topup,
    supplierSellsTopups: sells,
    status: profile.status,
    lifecycle: profile.lifecycle?.status ?? null,
    expiresAt: profile.expiresAt,
    topupDeadline: profile.topupDeadline,
    profileExpiresAt: profile.profileExpiresAt,
  });
}

/** The selling price of each cost, in cents; null where the currency has no rate. */
export async function priceTopupCosts(costs: Money[], plan: Pick<IEsimPlan, "providerCode" | "coverage">): Promise<Array<number | null>> {
  const { settings, rules } = await loadPricing();
  const rates = await currentRates(costs.map((cost) => cost.currency));
  return costs.map((cost) => {
    const rate = rates.get(cost.currency.toUpperCase());
    if (!rate) return null;
    return priceOf(
      {
        providerCode: plan.providerCode,
        scope: plan.coverage.scope,
        countryCodes: plan.coverage.countries.map((country) => country.code),
        costMinor: cost.amountMinor,
        usdPerUnit: rate.usdPerUnit,
      },
      rules,
      settings,
    ).retailMinor;
  });
}

/** A supplier's list for one eSIM is asked at most every two minutes. */
const LIST_CACHE_MS = 2 * 60_000;
const listCache = new Map<string, { at: number; plans: ProviderTopupPlan[] }>();

async function supplierTopups({ profile, provider }: Owned, fresh = false): Promise<ProviderTopupPlan[]> {
  if (!provider) throw new TopupError("The supplier of this eSIM is not available");
  const key = String(profile._id);
  const hit = listCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < LIST_CACHE_MS) return hit.plans;
  const ref = { providerEsimId: profile.providerEsimId, simId: profile.simId, iccid: profile.iccid };
  const plans = await withProviderLog(
    {
      provider: provider._id as mongoose.Types.ObjectId,
      providerCode: provider.code,
      operation: "topup.plans",
      refs: { esimId: key, orderId: String(profile.order) },
    },
    () => adapterFor(provider).listTopupPlans(ref),
    // A supplier may list thousands (RoamWifi: every area): the log keeps the count per area and a sample.
    (value) => ({
      total: value.length,
      perArea: Object.fromEntries(
        Object.entries(
          value.reduce<Record<string, number>>((counts, plan) => {
            const key = plan.area ? `${plan.area.key ?? "-"} ${plan.area.name}` : "-";
            counts[key] = (counts[key] ?? 0) + 1;
            return counts;
          }, {}),
        ).slice(0, 300),
      ),
      sample: value.slice(0, 10).map((plan) => ({ id: plan.topupPlanId, megabytes: plan.megabytes, days: plan.validityDays, cost: plan.cost })),
    }),
  );
  listCache.set(key, { at: Date.now(), plans });
  if (listCache.size > 500) listCache.delete(listCache.keys().next().value!);
  return plans;
}

export async function topupOffers(userId: string, esimId: string, options: { area?: string | null } = {}): Promise<TopupOffers | null> {
  const found = await owned(userId, esimId);
  if (!found) return null;
  const eligibility = eligibilityOf(found);
  const mode = found.plan.topup.mode === "none" ? null : found.plan.topup.mode;
  if (!eligibility.ok) return { eligibility, mode, offers: [], otherAreas: [] };
  let plans: ProviderTopupPlan[];
  try {
    plans = await supplierTopups(found);
  } catch (error) {
    const message = error instanceof ProviderError || error instanceof TopupError ? error.message : "The supplier could not be reached";
    return { eligibility, mode, offers: [], otherAreas: [], error: message };
  }
  const prices = await priceTopupCosts(plans.map((plan) => plan.cost), found.plan);
  // eSIM Access: the list as the supplier gives it for this ICCID, every one a renewal, nothing set aside.
  const anyArea = found.plan.topup.coverage === "any_area" && found.plan.providerCode !== "esimaccess";
  const planCountries = found.plan.coverage.countries.map((country) => country.code);
  const own = {
    sku: found.plan.sku,
    providerPlanId: found.plan.providerPlanId,
    countries: planCountries,
    destination: found.plan.destination,
    areaKey:
      found.plan.providerCode === "bnesim"
        ? bnesimAreaKey({ scope: found.plan.coverage.scope, countryCodes: planCountries, name: await bnesimPlanAreaName(found.plan._id) })
        : null,
  };
  const all = plans
    .map((plan, index) => {
      const sameArea = !anyArea || renewsOwnPlan(plan.area, own);
      const price = prices[index];
      const perDay = plan.perDay && price !== null ? { priceMinor: price, ...plan.perDay } : null;
      return {
        topupPlanId: plan.topupPlanId,
        name: plan.name,
        megabytes: plan.megabytes,
        validityDays: perDay ? perDay.defaultDays : plan.validityDays,
        priceMinor: perDay ? perDay.priceMinor * perDay.defaultDays : price,
        perDay,
        area: anyArea ? (plan.area?.name ?? null) : null,
        sameArea,
        dayGroup: plan.dayGroup ?? null,
        areaId: sameArea ? null : areaIdOf(plan.area),
      };
    })
    .filter((offer): offer is TopupOffer => offer.priceMinor !== null && offer.priceMinor > 0)
    .sort((a, b) => a.priceMinor - b.priceMinor || a.megabytes - b.megabytes);
  if (options.area) return { eligibility, mode, offers: all.filter((offer) => offer.areaId === options.area), otherAreas: [] };
  return { eligibility, mode, offers: all.filter((offer) => offer.sameArea), otherAreas: areasOf(all.filter((offer) => !offer.sameArea)) };
}

/** A BNESIM plan's region name, from the product it was made from (as its recharges name theirs). */
async function bnesimPlanAreaName(planId: unknown): Promise<string> {
  const row = await EsimPlan.findById(planId).select("+raw destination").lean<{ raw?: unknown; destination?: string } | null>();
  const raw = row?.raw && typeof row.raw === "object" ? (row.raw as Record<string, unknown>) : null;
  return (raw ? topupArea(raw as never, areaIndex([])).name : "") || row?.destination || "";
}

/** An area's id: the supplier's key for it, else its name. */
function areaIdOf(area: ProviderTopupPlan["area"]): string {
  return (area?.key || area?.name || "other").slice(0, 120);
}

/** The other areas, by name, with how many packages each has and from what price. */
function areasOf(offers: TopupOffer[]): TopupArea[] {
  const areas = new Map<string, TopupArea & { groups: Set<string> }>();
  for (const offer of offers) {
    const id = offer.areaId ?? "other";
    const area = areas.get(id) ?? { id, name: offer.area || id, count: 0, fromPriceMinor: offer.priceMinor, groups: new Set<string>() };
    area.groups.add(offer.dayGroup || offer.topupPlanId);
    area.count = area.groups.size;
    area.fromPriceMinor = Math.min(area.fromPriceMinor, offer.priceMinor);
    areas.set(id, area);
  }
  return [...areas.values()].map(({ groups: _groups, ...area }) => area).sort((a, b) => a.name.localeCompare(b.name));
}

export interface CreatedQuote {
  quoteId: string;
  product: TopupProductRef;
  priceMinor: number;
  label: string;
}

/**
 * Writes the quote for one offered top-up and returns what the cart line
 * needs. A day pass is quoted for `days` (its default days when none is
 * given, as an app from before the day stepper asks): the supplier's id for
 * those days, at its price per day times them.
 */
export async function createTopupQuote(userId: string, esimId: string, topupPlanId: string, days?: number | null): Promise<CreatedQuote | null> {
  const found = await owned(userId, esimId);
  if (!found) return null;
  const eligibility = eligibilityOf(found);
  if (!eligibility.ok) throw new TopupError("This eSIM cannot be topped up now");
  const product = await findTopupProduct();
  if (!product) throw new TopupError("Top-ups are not available yet");
  const listed = (await supplierTopups(found, true)).find((plan) => plan.topupPlanId === topupPlanId);
  if (!listed) throw new TopupError("This top-up is no longer offered for your eSIM");
  const offered = forDays(listed, days);
  const [unitMinor] = await priceTopupCosts([listed.cost], found.plan);
  if (!unitMinor) throw new TopupError("This top-up cannot be priced right now");
  // A day pass is priced per day, as the list showed it, so the cart charges what the stepper said.
  const priceMinor = listed.perDay ? unitMinor * offered.validityDays : unitMinor;
  const quote = await EsimTopupQuote.create({
    customer: new mongoose.Types.ObjectId(userId),
    esim: found.profile._id,
    iccid: found.profile.iccid,
    plan: found.plan._id,
    providerCode: found.profile.providerCode,
    topupPlanId: offered.topupPlanId,
    name: offered.name || `${offered.megabytes} MB`,
    megabytes: offered.megabytes,
    validityDays: offered.validityDays,
    mode: found.plan.topup.mode === "addon" ? "addon" : "stack",
    cost: offered.cost,
  });
  return { quoteId: String(quote._id), product, priceMinor, label: topupLineLabel(quote) };
}

/** The quote a cart or order line names, with its base plan — or null. */
export async function quoteWithPlan(quoteId: unknown): Promise<{ quote: IEsimTopupQuote; plan: IEsimPlan } | null> {
  if (!mongoose.isValidObjectId(quoteId)) return null;
  const quote = await EsimTopupQuote.findById(quoteId);
  if (!quote) return null;
  const plan = await EsimPlan.findById(quote.plan).select({ providerCode: 1, coverage: 1, topup: 1 }).lean<IEsimPlan | null>();
  return plan ? { quote, plan } : null;
}

/** Whether the quote's eSIM can still be topped up (checked again when it goes in the cart). */
export async function quoteStillEligible(quote: IEsimTopupQuote, userId: string): Promise<boolean> {
  const found = await owned(userId, String(quote.esim));
  return Boolean(found && eligibilityOf(found).ok);
}

/** Whether the eSIM takes top-ups at all, and whether it can now — no supplier call (the eSIM's page). */
export async function esimTopupStatus(userId: string, esimId: string): Promise<{ supported: boolean; eligibility: Eligibility } | null> {
  const found = await owned(userId, esimId);
  if (!found) return null;
  return { supported: found.plan.topup.supported && found.plan.topup.mode !== "none", eligibility: eligibilityOf(found) };
}

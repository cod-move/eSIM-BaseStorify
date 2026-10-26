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
import { topupEligibility, type Eligibility } from "@/lib/esim/topup/eligibility";
import { findTopupProduct, type TopupProductRef } from "@/lib/esim/topup/product";
import { topupLineLabel } from "@/lib/esim/topup/label";

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

export class TopupError extends Error {}

export interface TopupOffer {
  topupPlanId: string;
  name: string;
  megabytes: number;
  validityDays: number;
  priceMinor: number;
}

export interface TopupOffers {
  eligibility: Eligibility;
  mode: "stack" | "addon" | null;
  offers: TopupOffer[];
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
    (value) => value.map((plan) => ({ id: plan.topupPlanId, megabytes: plan.megabytes, days: plan.validityDays, cost: plan.cost })),
  );
  listCache.set(key, { at: Date.now(), plans });
  if (listCache.size > 500) listCache.delete(listCache.keys().next().value!);
  return plans;
}

export async function topupOffers(userId: string, esimId: string): Promise<TopupOffers | null> {
  const found = await owned(userId, esimId);
  if (!found) return null;
  const eligibility = eligibilityOf(found);
  const mode = found.plan.topup.mode === "none" ? null : found.plan.topup.mode;
  if (!eligibility.ok) return { eligibility, mode, offers: [] };
  let plans: ProviderTopupPlan[];
  try {
    plans = await supplierTopups(found);
  } catch (error) {
    const message = error instanceof ProviderError || error instanceof TopupError ? error.message : "The supplier could not be reached";
    return { eligibility, mode, offers: [], error: message };
  }
  const prices = await priceTopupCosts(plans.map((plan) => plan.cost), found.plan);
  const offers = plans
    .map((plan, index) => ({
      topupPlanId: plan.topupPlanId,
      name: plan.name,
      megabytes: plan.megabytes,
      validityDays: plan.validityDays,
      priceMinor: prices[index],
    }))
    .filter((offer): offer is TopupOffer => offer.priceMinor !== null && offer.priceMinor > 0)
    .sort((a, b) => a.priceMinor - b.priceMinor || a.megabytes - b.megabytes);
  return { eligibility, mode, offers };
}

export interface CreatedQuote {
  quoteId: string;
  product: TopupProductRef;
  priceMinor: number;
  label: string;
}

/** Writes the quote for one offered top-up and returns what the cart line needs. */
export async function createTopupQuote(userId: string, esimId: string, topupPlanId: string): Promise<CreatedQuote | null> {
  const found = await owned(userId, esimId);
  if (!found) return null;
  const eligibility = eligibilityOf(found);
  if (!eligibility.ok) throw new TopupError("This eSIM cannot be topped up now");
  const product = await findTopupProduct();
  if (!product) throw new TopupError("Top-ups are not available yet");
  const offered = (await supplierTopups(found, true)).find((plan) => plan.topupPlanId === topupPlanId);
  if (!offered) throw new TopupError("This top-up is no longer offered for your eSIM");
  const [priceMinor] = await priceTopupCosts([offered.cost], found.plan);
  if (!priceMinor) throw new TopupError("This top-up cannot be priced right now");
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

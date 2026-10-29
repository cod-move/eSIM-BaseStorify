import "server-only";

import { mongoose } from "@/lib/db";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProductLink } from "@/models/esim-product-link.model";
import { EsimProvider, type IEsimProvider } from "@/models/esim-provider.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";

/**
 * Checkout's last look at the plans behind the eSIMs in a cart (CAT-09).
 *
 * A variant can be sold while one of its plans is: active, available, from
 * an active supplier. The first such plan is then asked about at its
 * supplier, where that is one quick call (`planLookup`); a supplier that says
 * the plan is gone, or no longer available, has the plan marked unavailable
 * (the next publish takes it off the shop) and the next plan is asked. Only a
 * clear "gone" counts: a slow or failing supplier lets checkout go on, since
 * fulfilment fails over to the next plan anyway.
 */

const LOOKUP_TIMEOUT_MS = 4_000;
const CACHE_MS = 2 * 60_000;
/** At most this many suppliers are asked per variant, to keep checkout quick. */
const MAX_LOOKUPS = 2;

/** Answers kept briefly: checkout prices a cart more than once (quote, then order). */
const answers = new Map<string, { at: number; sold: boolean | null }>();

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** true: still sold; false: gone or unavailable; null: no clear answer. */
async function stillSold(provider: IEsimProvider, plan: { _id: mongoose.Types.ObjectId; providerPlanId: string }): Promise<boolean | null> {
  const key = `${provider.code}:${plan.providerPlanId}`;
  const cached = answers.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.sold;
  let sold: boolean | null = null;
  try {
    const adapter = adapterFor(provider);
    if (!adapter.capabilities.planLookup) return null;
    const found = await withTimeout(
      withProviderLog(
        {
          provider: provider._id as mongoose.Types.ObjectId,
          providerCode: provider.code,
          operation: "plan.check",
          refs: { planId: String(plan._id) },
          request: { providerPlanId: plan.providerPlanId },
        },
        () => adapter.getPlan(plan.providerPlanId),
        (value) => ({ found: Boolean(value), available: value?.available ?? null }),
      ),
      LOOKUP_TIMEOUT_MS,
    );
    if (found !== "timeout") sold = Boolean(found && found.available);
  } catch {
    sold = null;
  }
  answers.set(key, { at: Date.now(), sold });
  return sold;
}

/**
 * The eSIM variants among these that can no longer be sold, by id, with the
 * name of the variant. Variants that are not eSIMs are ignored.
 */
export async function unsellableVariants(variantIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const ids = [...new Set(variantIds)].filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return result;
  const links = await EsimProductLink.find({ "variants.variantId": { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select({ variants: 1 })
    .lean();
  const variants = links.flatMap((link) => link.variants).filter((variant) => ids.includes(String(variant.variantId)));
  if (!variants.length) return result;

  const plans = await EsimPlan.find({ _id: { $in: variants.flatMap((variant) => variant.candidates) } })
    .select({ providerCode: 1, providerPlanId: 1, status: 1, available: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; providerCode: string; providerPlanId: string; status: string; available: boolean }>>();
  const planById = new Map(plans.map((plan) => [String(plan._id), plan]));
  const providers = await EsimProvider.find({ code: { $in: [...new Set(plans.map((plan) => plan.providerCode))] }, status: "active" }).select("+secretCredentials");
  const providerByCode = new Map(providers.map((provider) => [provider.code, provider]));

  for (const variant of variants) {
    const live = variant.candidates
      .map((id) => planById.get(String(id)))
      .filter((plan): plan is NonNullable<typeof plan> => Boolean(plan && plan.status === "active" && plan.available && providerByCode.has(plan.providerCode)));
    let lookups = 0;
    while (live.length && lookups < MAX_LOOKUPS) {
      const plan = live[0];
      const sold = await stillSold(providerByCode.get(plan.providerCode)!, plan);
      if (sold !== false) break;
      lookups += 1;
      await EsimPlan.updateOne({ _id: plan._id }, { $set: { available: false } });
      console.warn(`[esim] ${plan.providerCode} no longer sells ${plan.providerPlanId}: marked unavailable at checkout`);
      live.shift();
    }
    if (!live.length) result.set(String(variant.variantId), variant.name);
  }
  return result;
}

/** For tests: forget the suppliers' answers. */
export function forgetPlanChecks() {
  answers.clear();
}

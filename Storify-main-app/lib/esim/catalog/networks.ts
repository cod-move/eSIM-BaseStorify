import "server-only";

import { mongoose } from "@/lib/db";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { adapterFor } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";

/**
 * Operators for plans whose catalogue entry names none (CAT-10). A
 * destination page asks for its plans after it has answered; each plan is
 * asked about at most once a week, whatever the answer, and only at a
 * supplier with a call for it (`planNetworks`). What comes back is kept in
 * `supplierNetworks`, which the storefront reads when `coverage.networks` is
 * empty. Returns how many plans gained operators, so the caller can refresh
 * the storefront's cache.
 */

const RECHECK_MS = 7 * 86_400_000;
const LOOKUP_TIMEOUT_MS = 8_000;
const MAX_PER_CALL = 5;

type Id = mongoose.Types.ObjectId;

export async function fillMissingNetworks(planIds: unknown[]): Promise<number> {
  const ids = planIds.map(String).filter((id) => mongoose.isValidObjectId(id));
  if (!ids.length) return 0;
  const due = new Date(Date.now() - RECHECK_MS);
  const plans = await EsimPlan.find({
    _id: { $in: ids },
    "coverage.networks.0": { $exists: false },
    $or: [{ supplierNetworks: null }, { "supplierNetworks.checkedAt": { $lt: due } }],
  })
    .select({ providerCode: 1, providerPlanId: 1, supplierNetworks: 1 })
    .limit(MAX_PER_CALL)
    .lean<Array<{ _id: Id; providerCode: string; providerPlanId: string; supplierNetworks: { list: Array<{ countryCode: string; operator: string; network: string | null }> } | null }>>();
  if (!plans.length) return 0;
  const providers = await EsimProvider.find({ code: { $in: [...new Set(plans.map((plan) => plan.providerCode))] }, status: "active" }).select("+secretCredentials");
  const providerByCode = new Map(providers.map((provider) => [provider.code, provider]));

  let gained = 0;
  for (const plan of plans) {
    const provider = providerByCode.get(plan.providerCode);
    const now = new Date();
    // Claimed first, so two page views never ask twice; a supplier without the call is not asked again for a week.
    const claimed = await EsimPlan.updateOne(
      { _id: plan._id, $or: [{ supplierNetworks: null }, { "supplierNetworks.checkedAt": { $lt: due } }] },
      { $set: { supplierNetworks: { list: plan.supplierNetworks?.list ?? [], checkedAt: now } } },
    );
    if (!claimed.modifiedCount || !provider) continue;
    let list: Array<{ countryCode: string; operator: string; network: string | null }> | null = null;
    try {
      const adapter = adapterFor(provider);
      if (!adapter.planNetworks) continue;
      const lookup = adapter.planNetworks.bind(adapter);
      list = await Promise.race([
        withProviderLog(
          {
            provider: provider._id as Id,
            providerCode: provider.code,
            operation: "plan.networks",
            refs: { planId: String(plan._id) },
            request: { providerPlanId: plan.providerPlanId },
          },
          () => lookup(plan.providerPlanId),
          (value) => ({ count: value.length }),
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)),
      ]);
    } catch (error) {
      console.warn(`[esim] networks for ${plan.providerCode} ${plan.providerPlanId}:`, error instanceof Error ? error.message : error);
    }
    if (list?.length) {
      await EsimPlan.updateOne({ _id: plan._id }, { $set: { supplierNetworks: { list, checkedAt: now } } });
      gained += 1;
    }
  }
  return gained;
}

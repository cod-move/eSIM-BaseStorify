import "server-only";

import type { AnyBulkWriteOperation, Types } from "mongoose";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimNumberPackage, type IEsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimPricingRule, getEsimSettings } from "@/models/esim-pricing.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import { priceOf, type PricingRule, type PricingSettings } from "@/lib/esim/pricing/price";
import { packagePricingInput } from "@/lib/esim/numbers/packages";

/**
 * Re-prices stored plans from their cost, the current rates and the rules.
 *
 * Plans an admin priced by hand are left alone. With `onlyIfFxMoved`, a plan
 * is re-priced only when its currency moved more than the configured
 * threshold since it was last priced — the daily FX refresh uses this so
 * prices do not twitch with every cent of the market. Rule or settings
 * changes call it without the flag, re-pricing everything. Number-card data
 * packages (NUM-02) are priced by the same policy, so they are re-priced with
 * the plans unless only another supplier's plans are.
 */

const BATCH_SIZE = 500;

export interface RepriceResult {
  considered: number;
  changed: number;
  /** Currencies with no stored rate; their plans keep their old price. */
  missingRates: string[];
}

/** The settings and enabled rules prices are computed from — re-pricing and the admin preview alike. */
export async function loadPricing(): Promise<{ settings: PricingSettings; rules: PricingRule[]; repriceThresholdPercent: number }> {
  const settingsDoc = await getEsimSettings();
  const rules: PricingRule[] = (await EsimPricingRule.find({ enabled: true }).lean()).map((rule) => ({
    id: String(rule._id),
    providerCode: rule.providerCode,
    countryCode: rule.countryCode,
    scope: rule.scope,
    markupPercent: rule.markupPercent,
    fixedMarkupMinor: rule.fixedMarkupMinor,
    priority: rule.priority,
  }));
  return {
    settings: {
      fxBufferPercent: settingsDoc.fxBufferPercent,
      defaultMarkupPercent: settingsDoc.defaultMarkupPercent,
      minMarginPercent: settingsDoc.minMarginPercent,
      rounding: settingsDoc.rounding,
    },
    rules,
    repriceThresholdPercent: settingsDoc.repriceThresholdPercent,
  };
}

export async function repricePlans(options: { onlyIfFxMoved?: boolean; providerCode?: string } = {}) {
  const { settings, rules, repriceThresholdPercent } = await loadPricing();

  const filter = {
    retailPriceManual: { $ne: true },
    ...(options.providerCode ? { providerCode: options.providerCode } : {}),
  };
  const rates = await currentRates(await EsimPlan.distinct("cost.currency", filter));
  const threshold = repriceThresholdPercent / 100;
  const result: RepriceResult = { considered: 0, changed: 0, missingRates: [] };
  const missing = new Set<string>();
  const pricedAt = new Date();
  let writes: AnyBulkWriteOperation<IEsimPlan>[] = [];

  const flush = async () => {
    if (!writes.length) return;
    const outcome = await EsimPlan.bulkWrite(writes, { ordered: false });
    result.changed += outcome.modifiedCount;
    writes = [];
  };

  const cursor = EsimPlan.find(filter)
    .select({ providerCode: 1, coverage: 1, cost: 1, retailPriceMinor: 1, pricing: 1 })
    .lean<IEsimPlan[]>()
    .cursor();
  for await (const plan of cursor) {
    result.considered += 1;
    const rate = rates.get(plan.cost.currency);
    if (!rate) {
      missing.add(plan.cost.currency);
      continue;
    }
    if (options.onlyIfFxMoved && plan.pricing) {
      const moved = Math.abs(rate.usdPerUnit - plan.pricing.usdPerUnit) / plan.pricing.usdPerUnit;
      if (moved <= threshold) continue;
    }
    const price = priceOf(
      {
        providerCode: plan.providerCode,
        scope: plan.coverage.scope,
        countryCodes: plan.coverage.countries.map((country) => country.code),
        costMinor: plan.cost.amountMinor,
        usdPerUnit: rate.usdPerUnit,
      },
      rules,
      settings,
    );
    const ruleId = price.ruleId as unknown as Types.ObjectId | null;
    if (
      plan.retailPriceMinor === price.retailMinor &&
      plan.pricing?.usdPerUnit === rate.usdPerUnit &&
      String(plan.pricing?.ruleId ?? null) === String(ruleId)
    ) {
      continue;
    }
    writes.push({
      updateOne: {
        filter: { _id: plan._id, retailPriceManual: { $ne: true } },
        update: {
          $set: {
            retailPriceMinor: price.retailMinor,
            pricing: {
              costUsdMinor: price.costUsdMinor,
              usdPerUnit: rate.usdPerUnit,
              ruleId,
              markupPercent: price.markupPercent,
              marginFloorApplied: price.marginFloorApplied,
              pricedAt,
            },
          },
        },
      },
    });
    if (writes.length >= BATCH_SIZE) await flush();
  }
  await flush();
  result.missingRates = [...missing];
  if (!options.providerCode || options.providerCode === "topconnect") {
    const packages = await repriceNumberPackages({ onlyIfFxMoved: options.onlyIfFxMoved }, { settings, rules, repriceThresholdPercent });
    result.considered += packages.considered;
    result.changed += packages.changed;
    result.missingRates = [...new Set([...result.missingRates, ...packages.missingRates])];
  }
  return result;
}

/**
 * Re-prices the number-card data packages in the card currency (TopConnect's
 * settlement currency, what every number price is in): the cost turned into
 * that currency, then the rules and rounding as for plans. The FX buffer is
 * left to checkout, which charges the price in USD with it. One an admin
 * priced by hand keeps its price.
 */
export async function repriceNumberPackages(
  options: { onlyIfFxMoved?: boolean; ids?: string[] } = {},
  pricing?: Awaited<ReturnType<typeof loadPricing>>,
): Promise<RepriceResult> {
  const { settings, rules, repriceThresholdPercent } = pricing ?? (await loadPricing());
  const filter = { retailPriceManual: { $ne: true }, ...(options.ids ? { _id: { $in: options.ids } } : {}) };
  const rows = await EsimNumberPackage.find(filter)
    .select({ countryCodes: 1, cost: 1, retailPriceMinor: 1, pricing: 1 })
    .lean<IEsimNumberPackage[]>();
  const provider = await EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean();
  const cardCurrency = (provider?.settlementCurrency ?? "EUR").toUpperCase();
  const rates = await currentRates([cardCurrency, ...rows.map((row) => row.cost.currency)]);
  const cardRate = rates.get(cardCurrency);
  const result: RepriceResult = { considered: rows.length, changed: 0, missingRates: [] };
  const missing = new Set<string>();
  const pricedAt = new Date();
  const writes: AnyBulkWriteOperation<IEsimNumberPackage>[] = [];
  for (const row of rows) {
    const rate = rates.get(row.cost.currency);
    if (!rate || !cardRate) {
      missing.add(rate ? cardCurrency : row.cost.currency);
      continue;
    }
    if (options.onlyIfFxMoved && row.pricing && row.pricing.currency === cardCurrency) {
      const moved = Math.abs(rate.usdPerUnit - row.pricing.usdPerUnit) / row.pricing.usdPerUnit;
      if (moved <= repriceThresholdPercent / 100) continue;
    }
    // Priced in the card currency: the cost's rate against it, no buffer (checkout adds it on the way to USD).
    const price = priceOf(packagePricingInput(row, rate.usdPerUnit / cardRate.usdPerUnit), rules, { ...settings, fxBufferPercent: 0 });
    const costUsdMinor = Math.round(row.cost.amountMinor * rate.usdPerUnit * (1 + settings.fxBufferPercent / 100));
    const ruleId = price.ruleId as unknown as Types.ObjectId | null;
    if (
      row.retailPriceMinor === price.retailMinor &&
      row.pricing?.currency === cardCurrency &&
      row.pricing?.usdPerUnit === rate.usdPerUnit &&
      row.pricing?.costUsdMinor === costUsdMinor &&
      String(row.pricing?.ruleId ?? null) === String(ruleId)
    ) {
      continue;
    }
    writes.push({
      updateOne: {
        filter: { _id: row._id, retailPriceManual: { $ne: true } },
        update: {
          $set: {
            retailPriceMinor: price.retailMinor,
            pricing: {
              costUsdMinor,
              usdPerUnit: rate.usdPerUnit,
              currency: cardCurrency,
              ruleId,
              markupPercent: price.markupPercent,
              marginFloorApplied: price.marginFloorApplied,
              pricedAt,
            },
          },
        },
      },
    });
  }
  if (writes.length) result.changed = (await EsimNumberPackage.bulkWrite(writes, { ordered: false })).modifiedCount;
  result.missingRates = [...missing];
  return result;
}

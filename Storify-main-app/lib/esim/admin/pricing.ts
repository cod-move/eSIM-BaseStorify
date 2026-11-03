import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { EsimPlan, type IEsimPlan } from "@/models/esim-plan.model";
import { EsimFxRate } from "@/models/esim-fx-rate.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimPricingRule, getEsimSettings } from "@/models/esim-pricing.model";
import { clearManualRate, currentRates, refreshEcbRates, setManualRate } from "@/lib/esim/pricing/fx-service";
import { loadPricing, repricePlans } from "@/lib/esim/pricing/reprice";
import { priceOf, type PricingRule, type PricingSettings, type RoundingMode } from "@/lib/esim/pricing/price";
import type { CoverageScope } from "@/lib/esim/providers/types";

/**
 * Admin → eSIM → Pricing (ADM-04, ADM-05): the settings every price is made
 * from, the layered markup rules, a preview of what a change would do to the
 * prices before it is saved, and the exchange rates behind them.
 *
 * Saving re-prices every plan not priced by hand; live products take the new
 * prices at their next publish.
 */

export interface RuleInput {
  providerCode: string | null;
  countryCode: string | null;
  scope: CoverageScope | null;
  markupPercent: number;
  fixedMarkupMinor: number;
  priority: number;
  enabled: boolean;
  note?: string;
}

export interface AdminRule extends RuleInput {
  id: string;
  /** Plans this rule prices right now. */
  plans: number;
}

export interface SettingsInput {
  fxBufferPercent: number;
  defaultMarkupPercent: number;
  minMarginPercent: number;
  rounding: RoundingMode;
  repriceThresholdPercent: number;
}

export async function getPricingConfig() {
  await connectDB();
  const settings = await getEsimSettings();
  const [rules, usage] = await Promise.all([
    EsimPricingRule.find().sort({ priority: -1, createdAt: 1 }).lean(),
    EsimPlan.aggregate<{ _id: mongoose.Types.ObjectId; n: number }>([
      { $match: { "pricing.ruleId": { $ne: null } } },
      { $group: { _id: "$pricing.ruleId", n: { $sum: 1 } } },
    ]),
  ]);
  const used = new Map(usage.map((row) => [String(row._id), row.n]));
  return {
    settings: {
      fxBufferPercent: settings.fxBufferPercent,
      defaultMarkupPercent: settings.defaultMarkupPercent,
      minMarginPercent: settings.minMarginPercent,
      rounding: settings.rounding,
      repriceThresholdPercent: settings.repriceThresholdPercent,
    } satisfies SettingsInput,
    rules: rules.map(
      (rule): AdminRule => ({
        id: String(rule._id),
        providerCode: rule.providerCode,
        countryCode: rule.countryCode,
        scope: rule.scope,
        markupPercent: rule.markupPercent,
        fixedMarkupMinor: rule.fixedMarkupMinor,
        priority: rule.priority,
        enabled: rule.enabled,
        note: rule.note,
        plans: used.get(String(rule._id)) ?? 0,
      }),
    ),
  };
}

/** A change the admin is about to make: new settings, or one rule added, changed or removed. */
export interface PricingChange {
  settings?: Partial<SettingsInput>;
  rule?: { id?: string; values?: RuleInput; remove?: boolean };
}

function applyChange(current: { settings: PricingSettings; rules: PricingRule[] }, change: PricingChange) {
  const settings: PricingSettings = { ...current.settings, ...change.settings };
  let rules = current.rules;
  if (change.rule) {
    const { id, values, remove } = change.rule;
    rules = rules.filter((rule) => rule.id !== id);
    if (!remove && values && values.enabled) {
      rules = [...rules, { id: id ?? "new", ...values }];
    }
  }
  return { settings, rules };
}

/**
 * What a change would do to the prices, without saving it: how many plans
 * move, up and down, and the biggest moves. Plans priced by hand are left
 * out, as re-pricing leaves them alone.
 */
export async function previewPricing(change: PricingChange) {
  await connectDB();
  const current = await loadPricing();
  const next = applyChange(current, change);
  const filter = { retailPriceManual: { $ne: true } };
  const rates = await currentRates((await EsimPlan.distinct("cost.currency", filter)) as string[]);
  const moves: Array<{ id: string; name: string; providerCode: string; from: number | null; to: number; status: string }> = [];
  let considered = 0;
  const missing = new Set<string>();
  const cursor = EsimPlan.find(filter)
    .select({ name: 1, providerCode: 1, coverage: 1, cost: 1, retailPriceMinor: 1, status: 1 })
    .lean<IEsimPlan[]>()
    .cursor();
  for await (const plan of cursor) {
    considered += 1;
    const rate = rates.get(plan.cost.currency);
    if (!rate) {
      missing.add(plan.cost.currency);
      continue;
    }
    const price = priceOf(
      {
        providerCode: plan.providerCode,
        scope: plan.coverage.scope,
        countryCodes: plan.coverage.countries.map((country) => country.code),
        costMinor: plan.cost.amountMinor,
        usdPerUnit: rate.usdPerUnit,
      },
      next.rules,
      next.settings,
    );
    if (price.retailMinor !== plan.retailPriceMinor) {
      moves.push({ id: String(plan._id), name: plan.name, providerCode: plan.providerCode, from: plan.retailPriceMinor, to: price.retailMinor, status: plan.status });
    }
  }
  const relative = (move: (typeof moves)[number]) => (move.from ? (move.to - move.from) / move.from : 1);
  const priced = moves.filter((move) => move.from !== null);
  return {
    considered,
    changed: moves.length,
    up: priced.filter((move) => move.to > (move.from ?? 0)).length,
    down: priced.filter((move) => move.to < (move.from ?? 0)).length,
    newlyPriced: moves.length - priced.length,
    activeChanged: moves.filter((move) => move.status === "active").length,
    averageChangePercent: priced.length ? Math.round((priced.reduce((sum, move) => sum + relative(move), 0) / priced.length) * 1000) / 10 : 0,
    biggest: [...priced].sort((a, b) => Math.abs(relative(b)) - Math.abs(relative(a))).slice(0, 10),
    missingRates: [...missing],
  };
}

/** Saves the change, then re-prices. */
export async function savePricing(change: PricingChange) {
  await connectDB();
  let before: Record<string, unknown> = {};
  let after: Record<string, unknown> = {};
  if (change.settings) {
    const settings = await getEsimSettings();
    before = { ...before, settings: { fxBufferPercent: settings.fxBufferPercent, defaultMarkupPercent: settings.defaultMarkupPercent, minMarginPercent: settings.minMarginPercent, rounding: settings.rounding, repriceThresholdPercent: settings.repriceThresholdPercent } };
    settings.set(change.settings);
    await settings.save();
    after = { ...after, settings: change.settings };
  }
  if (change.rule) {
    const { id, values, remove } = change.rule;
    if (id && !mongoose.isValidObjectId(id)) throw new Error("Unknown rule");
    const existing = id ? await EsimPricingRule.findById(id) : null;
    if (id && !existing) throw new Error("Unknown rule");
    if (existing) before = { ...before, rule: existing.toObject() };
    if (remove && existing) {
      await existing.deleteOne();
      after = { ...after, rule: null };
    } else if (values) {
      const doc = existing ?? new EsimPricingRule();
      doc.set({ ...values, countryCode: values.countryCode?.toUpperCase() || null, providerCode: values.providerCode || null });
      await doc.save();
      after = { ...after, rule: doc.toObject() };
    }
  }
  const repriced = await repricePlans();
  return { before, after, repriced };
}

/** The rates behind the prices: every currency a plan is costed in. */
export async function getFxOverview() {
  await connectDB();
  // Number-card data packages (NUM-02) are costed too, in TopConnect's currency.
  const [planCurrencies, packageCurrencies] = await Promise.all([
    EsimPlan.distinct("cost.currency") as Promise<string[]>,
    EsimNumberPackage.distinct("cost.currency") as Promise<string[]>,
  ]);
  const currencies = [...new Set([...planCurrencies, ...packageCurrencies])].filter(Boolean).sort();
  const resolved = await currentRates(currencies);
  const latestEcb = await EsimFxRate.findOne({ source: "ecb" }).sort({ effectiveAt: -1 }).select({ effectiveAt: 1 }).lean();
  const plansPer = new Map(
    (await EsimPlan.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$cost.currency", n: { $sum: 1 } } }])).map((row) => [row._id, row.n]),
  );
  return {
    lastEcbDate: latestEcb?.effectiveAt ? latestEcb.effectiveAt.toISOString().slice(0, 10) : null,
    rates: currencies.map((currency) => {
      const rate = resolved.get(currency);
      return {
        currency,
        usdPerUnit: rate?.usdPerUnit ?? null,
        source: rate?.source ?? null,
        effectiveAt: rate?.effectiveAt ? rate.effectiveAt.toISOString() : null,
        plans: plansPer.get(currency) ?? 0,
      };
    }),
  };
}

/** Pulls today's ECB rates and re-prices plans whose currency moved past the threshold. */
export async function refreshFx() {
  const refreshed = await refreshEcbRates();
  const repriced = await repricePlans({ onlyIfFxMoved: true });
  return { ...refreshed, repriced };
}

export async function overrideFx(currency: string, usdPerUnit: number | null, actor?: string) {
  if (usdPerUnit === null) await clearManualRate(currency);
  else await setManualRate(currency, usdPerUnit, actor);
  return repricePlans();
}

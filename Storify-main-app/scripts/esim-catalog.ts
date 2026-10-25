/**
 * eSIM pricing and publishing from the command line, until the admin pages exist.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-catalog.ts <command> ...
 *
 * Commands:
 *   fx refresh                              pull today's ECB rates
 *   fx set <CUR> <usdPerUnit>               manual override (e.g. fx set EUR 1.09)
 *   fx clear <CUR>                          back to the ECB rate
 *   fx show [CUR ...]                       the rates pricing uses now
 *   settings [--fxBuffer 3] [--markup 50] [--minMargin 15] [--rounding none|99|49_99] [--threshold 2]
 *   rule set [--provider X] [--country JP] [--scope local|regional|global] --markup 40 [--fixed 100] [--priority 0]
 *   rule list | rule delete <id>
 *   reprice [--provider X] [--fx-moved]     recompute selling prices
 *   prices [--provider X] [--country JP]    sample of priced plans
 *   plans activate|disable [--provider X] [--country JP] [--scope local|regional|global] [--product japan-esim]
 *                                           plans are synced disabled; only active ones are published
 *   publish [--product japan-esim ...] [--status draft|active]
 *                                           create/update storefront products (new ones default to draft)
 */
import { connectDB, disconnectDB } from "@/lib/db";
import { EsimPlan } from "@/models/esim-plan.model";
import { EsimPricingRule, getEsimSettings } from "@/models/esim-pricing.model";
import {
  clearManualRate,
  currentRates,
  refreshEcbRates,
  setManualRate,
} from "@/lib/esim/pricing/fx-service";
import { repricePlans } from "@/lib/esim/pricing/reprice";
import type { CoverageScope } from "@/lib/esim/providers/types";

function flags(args: string[]) {
  const named: Record<string, string> = {};
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      const next = args[index + 1];
      if (next === undefined || next.startsWith("--")) {
        named[arg.slice(2)] = "true";
      } else {
        named[arg.slice(2)] = next;
        index += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { named, positional };
}

function numberFlag(named: Record<string, string>, key: string): number | undefined {
  if (named[key] === undefined) return undefined;
  const value = Number(named[key]);
  if (!Number.isFinite(value)) throw new Error(`--${key} must be a number`);
  return value;
}

const usd = (minor: number | null | undefined) => (minor === null || minor === undefined ? "—" : `$${(minor / 100).toFixed(2)}`);

async function main() {
  const [command, sub, ...rest] = process.argv.slice(2);
  await connectDB();

  if (command === "fx") {
    const { positional } = flags(rest);
    if (sub === "refresh") console.log(await refreshEcbRates());
    else if (sub === "set") {
      const [currency, value] = positional;
      await setManualRate(currency, Number(value), "cli");
      console.log(`${currency.toUpperCase()} = ${value} USD (manual)`);
    } else if (sub === "clear") console.log(`removed ${await clearManualRate(positional[0])} manual rate(s)`);
    else {
      const currencies = positional.length ? positional : await EsimPlan.distinct("cost.currency");
      for (const rate of (await currentRates(currencies)).values()) {
        console.log(`${rate.currency}  ${rate.usdPerUnit.toFixed(6)} USD  ${rate.source}  ${rate.effectiveAt?.toISOString().slice(0, 10) ?? ""}`);
      }
    }
    return;
  }

  if (command === "settings") {
    const { named } = flags([sub, ...rest].filter(Boolean));
    const settings = await getEsimSettings();
    const map: Record<string, keyof typeof settings> = {
      fxBuffer: "fxBufferPercent",
      markup: "defaultMarkupPercent",
      minMargin: "minMarginPercent",
      threshold: "repriceThresholdPercent",
    };
    for (const [flag, field] of Object.entries(map)) {
      const value = numberFlag(named, flag);
      if (value !== undefined) settings.set(field, value);
    }
    if (named.rounding) settings.rounding = named.rounding as typeof settings.rounding;
    await settings.save();
    const { fxBufferPercent, defaultMarkupPercent, minMarginPercent, rounding, repriceThresholdPercent } = settings;
    console.log({ fxBufferPercent, defaultMarkupPercent, minMarginPercent, rounding, repriceThresholdPercent });
    return;
  }

  if (command === "rule") {
    const { named, positional } = flags(rest);
    if (sub === "set") {
      const markupPercent = numberFlag(named, "markup");
      if (markupPercent === undefined) throw new Error("--markup is required");
      const key = {
        providerCode: named.provider ?? null,
        countryCode: named.country?.toUpperCase() ?? null,
        scope: (named.scope as "local" | "regional" | "global" | undefined) ?? null,
      };
      const rule = await EsimPricingRule.findOneAndUpdate(
        { ...key, enabled: true },
        {
          $set: {
            ...key,
            markupPercent,
            fixedMarkupMinor: numberFlag(named, "fixed") ?? 0,
            priority: numberFlag(named, "priority") ?? 0,
            enabled: true,
          },
        },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
      console.log("saved rule", String(rule?._id));
    } else if (sub === "delete") {
      await EsimPricingRule.deleteOne({ _id: positional[0] });
      console.log("deleted");
    } else {
      for (const rule of await EsimPricingRule.find({ enabled: true }).sort({ providerCode: 1, countryCode: 1 })) {
        console.log(
          String(rule._id),
          `provider=${rule.providerCode ?? "*"} country=${rule.countryCode ?? "*"} scope=${rule.scope ?? "*"}`,
          `markup=${rule.markupPercent}% fixed=${usd(rule.fixedMarkupMinor)} priority=${rule.priority}`,
        );
      }
    }
    return;
  }

  if (command === "reprice") {
    const { named } = flags([sub, ...rest].filter(Boolean));
    console.log(await repricePlans({ providerCode: named.provider, onlyIfFxMoved: named["fx-moved"] === "true" }));
    return;
  }

  if (command === "prices") {
    const { named } = flags([sub, ...rest].filter(Boolean));
    const plans = await EsimPlan.find({
      ...(named.provider ? { providerCode: named.provider } : {}),
      ...(named.country ? { "coverage.countries.code": named.country.toUpperCase(), "coverage.scope": "local" } : {}),
    })
      .sort({ productSlug: 1, "data.megabytes": 1, validityDays: 1 })
      .limit(Number(named.limit ?? 15))
      .lean();
    for (const plan of plans) {
      console.log(
        `${plan.providerCode.padEnd(10)} ${plan.name.padEnd(36).slice(0, 36)} cost ${(plan.cost.amountMinor / 100).toFixed(2)} ${plan.cost.currency}` +
          ` → ${usd(plan.pricing?.costUsdMinor)} → sell ${usd(plan.retailPriceMinor)}${plan.cost.billingUnit === "day" ? "/day" : ""}` +
          `${plan.pricing?.marginFloorApplied ? " (margin floor)" : ""}`,
      );
    }
    return;
  }

  if (command === "plans" && (sub === "activate" || sub === "disable")) {
    const { named } = flags(rest);
    const filter = {
      ...(named.provider ? { providerCode: named.provider } : {}),
      ...(named.country ? { "coverage.countries.code": named.country.toUpperCase() } : {}),
      ...(named.scope ? { "coverage.scope": named.scope as CoverageScope } : {}),
      ...(named.product ? { productSlug: named.product } : {}),
    };
    if (named.scope && !["local", "regional", "global"].includes(named.scope)) {
      throw new Error("--scope must be local, regional or global");
    }
    if (!Object.keys(filter).length && named.all !== "true") {
      throw new Error("Name a --provider, --country, --scope or --product (or pass --all)");
    }
    const result = await EsimPlan.updateMany(filter, {
      $set: { status: sub === "activate" ? "active" : "disabled" },
    });
    console.log(`${sub}: ${result.modifiedCount} of ${result.matchedCount} matching plans changed`);
    return;
  }

  if (command === "publish") {
    const args = [sub, ...rest].filter(Boolean);
    const products = args.flatMap((arg, index) => (args[index - 1] === "--product" ? [arg] : []));
    const status = args[args.indexOf("--status") + 1] === "active" ? "active" : "draft";
    const { publishProducts } = await import("@/lib/esim/catalog/publish");
    const result = await publishProducts({ productSlugs: products.length ? products : undefined, status });
    console.log({
      created: result.created.length,
      updated: result.updated.length,
      unchanged: result.unchanged.length,
      drafted: result.drafted.length,
      sample: [...result.created, ...result.updated].slice(0, 10),
    });
    return;
  }

  console.log("Commands: fx refresh|set|clear|show, settings, rule set|list|delete, reprice, prices, plans activate|disable, publish");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());

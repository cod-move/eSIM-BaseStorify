import "server-only";

import { connectDB } from "@/lib/db";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberPackage } from "@/models/esim-number-package.model";
import { EsimProvider } from "@/models/esim-provider.model";
import { getEsimSettings } from "@/models/esim-pricing.model";
import { currentRates } from "@/lib/esim/pricing/fx-service";
import { findNumberProduct, findNumberTopupProduct } from "@/lib/esim/numbers/product";
import { RECHARGE_MAX_MINOR, RECHARGE_MIN_MINOR, RECHARGE_SUGGESTIONS_MINOR } from "@/lib/esim/numbers/line";

/**
 * The numbers page (NUM-03): numbers on sale, filtered by country code,
 * digits and premium, and what can be added to one — a first recharge and a
 * data package. Anyone can browse; buying needs an account (the cart says so).
 * Install details are never read here.
 */

export const NUMBERS_SHOP_PAGE_SIZE = 24;

export type PremiumFilter = "all" | "standard" | "premium";

export interface ShopNumberFilters {
  dialCode?: string;
  /** Digits the number contains, e.g. "888". */
  digits?: string;
  premium?: PremiumFilter;
  page?: number;
}

export interface ShopNumber {
  id: string;
  dialCode: string;
  nationalNumber: string;
  country: string | null;
  priceMinor: number;
  premiumMinor: number;
}

export interface ShopPacket {
  id: string;
  name: string;
  volumeMb: number | null;
  validityDays: number;
  countryCodes: string[];
  priceMinor: number;
}

export interface NumberShop {
  rows: ShopNumber[];
  total: number;
  page: number;
  pages: number;
  dialCodes: Array<{ code: string; country: string | null; count: number }>;
  packets: ShopPacket[];
  /** First recharge: chosen in the card's currency; `usdPerUnit` already carries the FX buffer, for showing the price only (the cart prices it). */
  recharge: { currency: string; usdPerUnit: number | null; minMinor: number; maxMinor: number; suggestions: number[] };
  /** The hidden product a number is added to the cart as; null until an admin imports numbers. */
  product: { productId: string; variantId: string } | null;
}

/** Free numbers, and held ones whose hold ran out (the cron has not released them yet). */
const onSale = (now: Date) => ({ $or: [{ status: "available" }, { status: "reserved", "reservation.until": { $lt: now } }], customer: null });

/** What can be bought for a number the shopper owns (NUM-08/09): packages, credit, and the product their lines use. */
export async function numberTopupOptions(): Promise<Pick<NumberShop, "packets" | "recharge" | "product">> {
  await connectDB();
  const [packets, provider, product, settings] = await Promise.all([
    EsimNumberPackage.find({ status: "active", retailPriceMinor: { $gt: 0 } }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean(),
    findNumberTopupProduct(),
    getEsimSettings(),
  ]);
  const currency = provider?.settlementCurrency ?? "EUR";
  const rate = (await currentRates([currency])).get(currency);
  return {
    packets: packets.map((row) => ({ id: String(row._id), name: row.name, volumeMb: row.volumeMb, validityDays: row.validityDays, countryCodes: row.countryCodes, priceMinor: row.retailPriceMinor })),
    recharge: {
      currency,
      usdPerUnit: rate ? rate.usdPerUnit * (1 + settings.fxBufferPercent / 100) : null,
      minMinor: RECHARGE_MIN_MINOR,
      maxMinor: RECHARGE_MAX_MINOR,
      suggestions: RECHARGE_SUGGESTIONS_MINOR.filter((amount) => amount > 0),
    },
    product: product ? { productId: product.productId, variantId: product.variantId } : null,
  };
}

export async function numberShop(filters: ShopNumberFilters): Promise<NumberShop> {
  await connectDB();
  const now = new Date();
  const match: Record<string, unknown> = { ...onSale(now) };
  if (filters.dialCode && /^\d{1,4}$/.test(filters.dialCode)) match.dialCode = filters.dialCode;
  const digits = filters.digits?.replace(/\D/g, "").slice(0, 12);
  if (digits) match.nationalNumber = { $regex: digits };
  if (filters.premium === "premium") match.premiumMinor = { $gt: 0 };
  else if (filters.premium === "standard") match.premiumMinor = 0;

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const [rows, total, codes, packets, provider, product, settings] = await Promise.all([
    EsimNumber.find(match)
      .select({ dialCode: 1, nationalNumber: 1, country: 1, priceMinor: 1, premiumMinor: 1 })
      .sort({ premiumMinor: 1, priceMinor: 1, msisdn: 1 })
      .skip((page - 1) * NUMBERS_SHOP_PAGE_SIZE)
      .limit(NUMBERS_SHOP_PAGE_SIZE)
      .lean(),
    EsimNumber.countDocuments(match),
    EsimNumber.aggregate<{ _id: string; country: string | null; count: number }>([
      { $match: onSale(now) },
      { $group: { _id: "$dialCode", country: { $first: "$country" }, count: { $sum: 1 } } },
    ]),
    EsimNumberPackage.find({ status: "active", retailPriceMinor: { $gt: 0 } }).sort({ sortOrder: 1, createdAt: 1 }).lean(),
    EsimProvider.findOne({ code: "topconnect" }).select({ settlementCurrency: 1 }).lean(),
    findNumberProduct(),
    getEsimSettings(),
  ]);
  const currency = provider?.settlementCurrency ?? "EUR";
  const rate = (await currentRates([currency])).get(currency);

  return {
    rows: rows.map((row) => ({
      id: String(row._id),
      dialCode: row.dialCode,
      nationalNumber: row.nationalNumber,
      country: row.country,
      priceMinor: row.priceMinor,
      premiumMinor: row.premiumMinor,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / NUMBERS_SHOP_PAGE_SIZE)),
    dialCodes: codes
      .map((row) => ({ code: row._id, country: row.country, count: row.count }))
      .sort((a, b) => Number(a.code) - Number(b.code)),
    packets: packets.map((row) => ({
      id: String(row._id),
      name: row.name,
      volumeMb: row.volumeMb,
      validityDays: row.validityDays,
      countryCodes: row.countryCodes,
      priceMinor: row.retailPriceMinor,
    })),
    recharge: {
      currency,
      usdPerUnit: rate ? rate.usdPerUnit * (1 + settings.fxBufferPercent / 100) : null,
      minMinor: RECHARGE_MIN_MINOR,
      maxMinor: RECHARGE_MAX_MINOR,
      suggestions: RECHARGE_SUGGESTIONS_MINOR,
    },
    product: product ? { productId: product.productId, variantId: product.variantId } : null,
  };
}

export interface NumbersTeaser {
  count: number;
  fromMinor: number;
  samples: Array<{ dialCode: string; nationalNumber: string; premium: boolean }>;
}

/** The homepage entry (NUM-03): how many numbers are on sale, from what price, and a few of them (memorable first). Null when none. */
export async function numbersTeaser(sampleCount: number): Promise<NumbersTeaser | null> {
  await connectDB();
  const match: Record<string, unknown> = onSale(new Date());
  const [count, cheapest, samples] = await Promise.all([
    EsimNumber.countDocuments(match),
    EsimNumber.aggregate<{ price: number }>([{ $match: match }, { $project: { price: { $add: ["$priceMinor", "$premiumMinor"] } } }, { $sort: { price: 1 } }, { $limit: 1 }]),
    sampleCount > 0
      ? EsimNumber.find(match).select({ dialCode: 1, nationalNumber: 1, premiumMinor: 1 }).sort({ premiumMinor: -1, msisdn: 1 }).limit(sampleCount).lean()
      : [],
  ]);
  if (!count) return null;
  return {
    count,
    fromMinor: cheapest[0]?.price ?? 0,
    samples: samples.map((row) => ({ dialCode: row.dialCode, nationalNumber: row.nationalNumber, premium: row.premiumMinor > 0 })),
  };
}

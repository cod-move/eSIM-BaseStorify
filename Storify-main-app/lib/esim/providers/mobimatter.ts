import { countryCodeFromName, countryNameFromCode } from "./countries";
import { requestJson, type FetchLike } from "./http";
import { countryCodes, currency as currencyOf, int, iso2, megabytesLabel, num, obj, objArray, parseLpa, slugify, splitList, str, strOrNull } from "./json";
import {
  ProviderError,
  type CancelResult,
  type CoverageScope,
  type DataType,
  type EsimProviderAdapter,
  type EsimRef,
  type JsonObject,
  type JsonValue,
  type LifecycleStatus,
  type ProviderEsim,
  type ProviderPlan,
  type ProviderTopupPlan,
  type ProviderUsage,
  type PurchaseInput,
  type PurchaseResult,
  type TopupInput,
  type TopupResult,
} from "./types";

/**
 * MobiMatter partner API (https://api.mobimatter.com/mobimatter/api/v2),
 * ported from the live esim_php adapter and the TypeScript rewrite.
 *
 * JSON over HTTPS with `merchantId` and `api-key` headers. Everything about
 * an eSIM is keyed by the order that bought it, so `providerEsimId` holds
 * that order id. Buying is two calls the supplier gives no idempotency key
 * for — create an order (nothing charged), then complete it (charged, and the
 * eSIM comes back) — so `purchase` only creates and `queryPurchase` completes
 * an order that is still "created", reading it first: a retried step never
 * completes it twice. Top-ups (add-on products of the eSIM's product family)
 * work the same way through `topup` and `queryTopup`.
 */

const DEFAULT_BASE_URL = "https://api.mobimatter.com/mobimatter/api/v2";
const BASE_CATEGORIES = ["esim_realtime", "esim_delayed"];
const ADDON_CATEGORY = "esim_addon";

export interface MobiMatterOptions {
  merchantId: string;
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export class MobiMatterAdapter implements EsimProviderAdapter {
  readonly code = "mobimatter";
  readonly displayName = "MobiMatter";
  // getPlan reads the whole product list.
  readonly capabilities = { listPlans: true, purchase: true, usage: true, topup: true, cancel: true, planLookup: false } as const;

  private readonly merchantId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(options: MobiMatterOptions) {
    this.merchantId = options.merchantId.trim();
    this.apiKey = options.apiKey.trim();
    if (!this.merchantId || !this.apiKey) throw new ProviderError("credentials_missing", "MobiMatter merchant id and api key are required");
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
  }

  async probe() {
    const products = await this.products();
    return { message: "MobiMatter credentials accepted", metadata: { products: products.length } as JsonObject };
  }

  /** Only the product lines we sell (`SOLD_FAMILIES`, "3HK", by `productFamilyName`); the rest are left out. */
  async *listPlans(): AsyncIterable<ProviderPlan> {
    const products = await this.products();
    // A list that names no product line cannot be filtered: stop rather than retire every plan.
    if (products.length && !products.some((product) => str(product.productFamilyName))) {
      throw new ProviderError("invalid_response", "MobiMatter products have no productFamilyName, so the 3HK plans cannot be picked out", null, "mobimatter");
    }
    for (const product of products) {
      if (!soldFamily(product)) continue;
      const plan = mapProduct(product);
      if (plan) yield plan;
    }
  }

  async getPlan(providerPlanId: string) {
    const [productId] = providerPlanId.split("|");
    const product = (await this.products()).find((row) => str(row.productId) === productId);
    return product ? mapProduct(product) : null;
  }

  /** Creates the order — nothing is charged yet. `queryPurchase` completes it. */
  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const [productId, category = "esim_realtime"] = input.providerPlanId.split("|");
    const orderId = await this.createOrder({ productId, productCategory: category, label: input.idempotencyKey });
    return { status: "processing", providerOrderId: orderId, charged: null, esim: null, raw: { orderId } };
  }

  async queryPurchase(providerOrderId: string): Promise<PurchaseResult> {
    let order = await this.order(providerOrderId);
    if (stateOf(order) === "created") order = result(await this.call("PUT", "/order/complete", { orderId: providerOrderId }));
    const state = stateOf(order);
    if (["cancelled", "canceled", "failed", "refunded", "rejected"].includes(state)) {
      throw new ProviderError("rejected", `MobiMatter order ${providerOrderId} is ${state}`);
    }
    const line = obj(order.orderLineItem);
    const charged = num(line.wholesalePrice) !== null ? { currency: currencyOf(order.currencyCode ?? line.currencyCode, "USD"), amountMinor: cents(line.wholesalePrice) } : null;
    const esim = mapOrder(order, providerOrderId);
    if (!esim.installation.activationCode || !["completed", "complete", "fulfilled", ""].includes(state)) {
      return { status: "processing", providerOrderId, charged, esim: null, raw: order };
    }
    return { status: "fulfilled", providerOrderId, charged, esim, raw: order };
  }

  async getEsim(ref: EsimRef) {
    const orderId = await this.orderIdOf(ref);
    return mapOrder(await this.order(orderId), orderId);
  }

  async getUsage(ref: EsimRef): Promise<ProviderUsage> {
    const orderId = await this.orderIdOf(ref);
    const info = providerInfo(await this.call("GET", `/provider/info/${encodeURIComponent(orderId)}`, undefined, { returnBundleIds: "false" }));
    const packages = objArray(info.packages);
    const totalMb = packages.reduce((sum, row) => sum + (num(row.totalAllowanceMb) ?? 0), 0);
    const usedMb = packages.reduce((sum, row) => sum + (num(row.usedMb) ?? 0), 0);
    const expiresAt = packages.map((row) => date(row.expirationDate)).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    const totalBytes = Math.round(totalMb * 1024 * 1024);
    const usedBytes = Math.round(usedMb * 1024 * 1024);
    const esim = obj(info.esim);
    return {
      totalBytes,
      usedBytes,
      remainingBytes: Math.max(totalBytes - usedBytes, 0),
      lifecycleStatus: lifecycle(str(esim.status), packages.length > 0 || Boolean(str(esim.installationDate)), totalMb, usedMb, expiresAt),
      expiresAt,
      syncedAt: null,
      stale: null,
      raw: info,
    };
  }

  /** The add-on products of the family the eSIM's own product belongs to. */
  async listTopupPlans(ref: EsimRef): Promise<ProviderTopupPlan[]> {
    const orderId = await this.orderIdOf(ref);
    const order = await this.order(orderId);
    const line = obj(order.orderLineItem);
    const products = await this.products();
    const own = products.find((product) => str(product.productId) === (str(line.productId) || str(order.productId)));
    const familyId = str(own?.productFamilyId) || str(line.productFamilyId);
    if (!familyId) return [];
    const addons = (await this.products({ category: ADDON_CATEGORY, familyId })).filter((product) => str(product.productFamilyId) === familyId);
    return addons.flatMap((product) => {
      const id = str(product.productId);
      if (!id) return [];
      const details = detailsOf(product.productDetails);
      const megabytes = dataMegabytes(details);
      return [{
        topupPlanId: id,
        name: str(details.PLAN_TITLE) || fallbackName(product, details),
        megabytes,
        validityDays: hoursToDays(details.PLAN_VALIDITY),
        cost: { currency: currencyOf(product.currencyCode, "USD"), amountMinor: cents(product.wholesalePrice ?? product.retailPrice) },
        raw: product,
      }];
    });
  }

  /** Creates the add-on order — nothing is charged yet. `queryTopup` completes it. */
  async topup(input: TopupInput): Promise<TopupResult> {
    const orderId = await this.orderIdOf(input.esim);
    const topupOrderId = await this.createOrder({ productId: input.topupPlanId, productCategory: ADDON_CATEGORY, label: input.idempotencyKey, addOnIdentifier: orderId });
    return { status: "processing", providerTopupId: topupOrderId, raw: { orderId: topupOrderId } };
  }

  async queryTopup(providerTopupId: string): Promise<TopupResult> {
    let order = await this.order(providerTopupId);
    if (stateOf(order) === "created") order = result(await this.call("PUT", "/order/complete", { orderId: providerTopupId }));
    const state = stateOf(order);
    if (["cancelled", "canceled", "failed", "refunded", "rejected"].includes(state)) return { status: "failed", providerTopupId, raw: order };
    return { status: ["completed", "complete", "fulfilled", ""].includes(state) ? "completed" : "processing", providerTopupId, raw: order };
  }

  /** An order not completed yet is cancelled; a completed one is refunded where MobiMatter allows it. */
  async cancel(ref: EsimRef): Promise<CancelResult> {
    const orderId = await this.orderIdOf(ref);
    const order = await this.order(orderId);
    const state = stateOf(order);
    if (["cancelled", "canceled", "refunded"].includes(state)) return { status: "cancelled", raw: order };
    if (state === "created") return { status: "cancelled", raw: await this.call("PUT", "/order/cancel", { orderId }) };
    const eligibility = result(await this.call("GET", `/order/${encodeURIComponent(orderId)}/refund/eligibility`));
    if (eligibility.isEligible === false) return { status: "not_supported", raw: eligibility };
    return { status: "cancelled", raw: await this.call("PUT", "/order/refund", { orderId }) };
  }

  /** CAT-10: the catalogue names operators only for a single-country product; this lists them all. */
  async planNetworks(providerPlanId: string) {
    const [productId] = providerPlanId.split("|");
    const response = await this.call("GET", `/products/${encodeURIComponent(productId)}/networks`);
    return networksOf(Array.isArray(response.result) ? objArray(response.result) : objArray(response.data));
  }

  private async products(query?: Record<string, string>): Promise<JsonObject[]> {
    const response = await this.call("GET", "/products", undefined, query);
    const list = objArray(response.result);
    if (!Array.isArray(response.result)) throw new ProviderError("invalid_response", "MobiMatter returned no product list");
    return list;
  }

  private async order(orderId: string): Promise<JsonObject> {
    return result(await this.call("GET", `/order/${encodeURIComponent(orderId)}`));
  }

  private async createOrder(body: { productId: string; productCategory: string; label: string; addOnIdentifier?: string }): Promise<string> {
    const response = await this.call("POST", "/order", body);
    const created = result(response);
    const orderId = str(created.orderId) || str(response.orderId);
    if (!orderId) throw new ProviderError("invalid_response", "MobiMatter returned no order id");
    return orderId;
  }

  /** MobiMatter keys an eSIM by its order; one known only by ICCID is looked up. */
  private async orderIdOf(ref: EsimRef): Promise<string> {
    if (ref.providerEsimId) return ref.providerEsimId;
    if (!ref.iccid) throw new ProviderError("not_found", "MobiMatter needs the order id or the ICCID of the eSIM");
    const found = await this.call("GET", "/order", undefined, { ICCID: ref.iccid });
    const rows = Array.isArray(found.result) ? objArray(found.result) : [result(found)];
    const orderId = rows.map((row) => str(row.orderId)).find(Boolean);
    if (!orderId) throw new ProviderError("not_found", "MobiMatter has no order for that ICCID");
    return orderId;
  }

  private async call(method: "GET" | "POST" | "PUT", path: string, body?: unknown, query?: Record<string, string>): Promise<JsonObject> {
    const { ok, status, body: response } = await requestJson(this.fetcher, {
      method,
      url: `${this.baseUrl}${path}`,
      headers: { merchantId: this.merchantId, "api-key": this.apiKey },
      query,
      body,
    });
    const message = str(response.message) || str(response.errorMessage);
    if (!ok) {
      throw new ProviderError(status >= 500 ? "uncertain" : status === 401 || status === 403 ? "credentials_missing" : "rejected", `MobiMatter ${path} failed with HTTP ${status}${message ? `: ${message}` : ""}`, status);
    }
    if (response.isSuccess === false || (num(response.statusCode) ?? 200) >= 400) {
      throw new ProviderError("rejected", `MobiMatter ${path} refused: ${message || "no reason given"}`);
    }
    return response;
  }
}

/** MobiMatter's network rows → one entry per country and operator, with its fastest generation. */
export function networksOf(rows: JsonObject[]): Array<{ countryCode: string; operator: string; network: string | null }> {
  const seen = new Map<string, { countryCode: string; operator: string; network: string | null }>();
  for (const row of rows) {
    const countryCode = iso2(str(row.countryCode));
    const operator = str(row.brand) || str(row.tadig) || str(row.networkId);
    if (!countryCode || !operator) continue;
    const network = row.is5G === true || row.is5G === "true" ? "5G" : row.is4G === true || row.is4G === "true" ? "4G" : null;
    const key = `${countryCode}|${operator}`;
    const known = seen.get(key);
    if (!known || (network === "5G" && known.network !== "5G") || (network && !known.network)) seen.set(key, { countryCode, operator, network });
  }
  return [...seen.values()];
}

function result(response: JsonObject): JsonObject {
  const inner = obj(response.result);
  return Object.keys(inner).length ? inner : response;
}

function stateOf(order: JsonObject): string {
  return (str(order.orderState) || str(order.status) || str(order.order_state)).toLowerCase();
}

/** productDetails / lineItemDetails: [{ name, value }] → { NAME: value }. */
export function detailsOf(value: JsonValue | undefined): Record<string, JsonValue> {
  const details: Record<string, JsonValue> = {};
  for (const item of objArray(value)) {
    const name = str(item.name).trim();
    if (name) details[name] = item.value ?? null;
  }
  return details;
}

const truthy = (value: JsonValue | undefined) => ["1", "true", "yes"].includes(str(value).toLowerCase());

function cents(value: JsonValue | undefined) {
  const amount = num(value);
  return amount !== null && amount > 0 ? Math.round(amount * 100) : 0;
}

function hoursToDays(value: JsonValue | undefined) {
  const hours = int(value) ?? 0;
  return hours > 0 ? Math.ceil(hours / 24) : 0;
}

function dataMegabytes(details: Record<string, JsonValue>) {
  const limit = num(details.PLAN_DATA_LIMIT) ?? 0;
  if (!(limit > 0)) return 0;
  const unit = str(details.PLAN_DATA_UNIT).toUpperCase() || "GB";
  const factor = unit.startsWith("T") ? 1024 * 1024 : unit.startsWith("G") ? 1024 : unit.startsWith("K") ? 1 / 1024 : 1;
  return Math.round(limit * factor);
}

/** PLAN_DETAILS is JSON ({ heading, description, items }) or plain text; with SPEED_LONG, lower-cased. */
function planText(details: Record<string, JsonValue>) {
  const parts: string[] = [];
  const raw = str(details.PLAN_DETAILS);
  if (raw) {
    try {
      const parsed = obj(JSON.parse(raw));
      for (const key of ["heading", "description"]) if (str(parsed[key])) parts.push(str(parsed[key]));
      if (Array.isArray(parsed.items)) for (const item of parsed.items) if (str(item)) parts.push(str(item));
    } catch {
      parts.push(raw);
    }
  }
  if (str(details.SPEED_LONG)) parts.push(str(details.SPEED_LONG));
  return parts.join(" ").toLowerCase();
}

/** The speed after the fair-use allowance, in Mbps, from MobiMatter's own wording. */
export function reducedSpeedMbps(details: Record<string, JsonValue>): number | null {
  const text = str(details.SPEED_LONG) || planText(details);
  if (!text || /no\s+throttling|no\s+daily\s+limits/i.test(text)) return null;
  const match =
    text.match(/(?:limited\s+to|(?:reduced|limited)\s+to|after.*?\bto)\s*(\d+(?:\.\d+)?)\s*(kbps|mbps|gbps)/i) ??
    text.match(/\b(\d+(?:\.\d+)?)\s*(kbps|mbps|gbps)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  return unit === "kbps" ? value / 1000 : unit === "gbps" ? value * 1000 : value;
}

function isDailyAllowance(text: string) {
  if (!text || /no\s+daily\s+limits?/i.test(text)) return false;
  return /(?:\bdaily\s+\d+(?:\.\d+)?\s*(kb|mb|gb|tb)\b|\b\d+(?:\.\d+)?\s*(kb|mb|gb|tb)\s+(?:high-speed\s+)?(?:allowance\s+)?per\s+day\b|\b\d+(?:\.\d+)?\s*(kb|mb|gb|tb)\s*\/\s*day\b)/i.test(text);
}

/** "Please start using the eSIM no more than 6 months after purchase", in days. */
export function preInstallDays(details: Record<string, JsonValue>): number | null {
  const match = planText(details).match(/(?:start using the esim no more than|usage must start within|use the esim no more than)\s+(\d+)\s+(day|week|month|year)s?\s+(?:after|from)\s+purchase/i);
  if (!match) return null;
  const value = Number(match[1]);
  return value * ({ day: 1, week: 7, month: 30, year: 365 } as const)[match[2].toLowerCase() as "day" | "week" | "month" | "year"];
}

function fallbackName(product: JsonObject, details: Record<string, JsonValue>) {
  const family = str(product.productFamilyName) || str(product.providerName) || "MobiMatter";
  const days = hoursToDays(details.PLAN_VALIDITY);
  return str(details.PLAN_DATA_LIMIT) ? `${family} ${str(details.PLAN_DATA_LIMIT)} ${str(details.PLAN_DATA_UNIT).toUpperCase()} / ${days} Days` : family;
}

const ISO3: Record<string, string> = {
  HKG: "HK", SGP: "SG", USA: "US", GBR: "GB", CHN: "CN", JPN: "JP", KOR: "KR", TWN: "TW", MAC: "MO",
  DEU: "DE", FRA: "FR", NLD: "NL", MYS: "MY", THA: "TH", ARE: "AE", AUS: "AU", CAN: "CA", IND: "IN",
};

/**
 * IP_BREAKOUT → exit countries. MobiMatter writes it as codes ("HK", "HKG"),
 * names ("Hong Kong", "Singapore IP") or a list of them ("HK/SG",
 * "Hong Kong, Singapore", JSON array); what cannot be read is left out.
 */
export function breakoutCountries(value: JsonValue | undefined): string[] {
  const text = Array.isArray(value) ? value.map((part) => str(part)).join(",") : str(value);
  const codes = new Set<string>();
  for (const raw of text.split(/[\/,;|]|\s+(?:and|&)\s+/i)) {
    const inBrackets = raw.match(/\(([A-Za-z]{2,3})\)/)?.[1];
    const part = (inBrackets ?? raw).replace(/\b(ip|breakout|exit)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (!part) continue;
    const upper = part.toUpperCase();
    const code = /^[A-Z]{2}$/.test(upper) ? (upper === "UK" ? "GB" : upper) : /^[A-Z]{3}$/.test(upper) ? (ISO3[upper] ?? null) : countryCodeFromName(part);
    if (code) codes.add(code);
  }
  return [...codes];
}

export function mapProduct(product: JsonObject): ProviderPlan | null {
  const productId = str(product.productId);
  const category = str(product.productCategory);
  if (!productId || !BASE_CATEGORIES.includes(category)) return null;
  const details = detailsOf(product.productDetails);
  const countries = countryCodes((Array.isArray(product.countries) ? product.countries : []).map((code) => str(code)));
  const regions = (Array.isArray(product.regions) ? product.regions : []).map((name) => str(name)).filter(Boolean);
  const scope: CoverageScope = /global|world/i.test(regions[0] ?? "") ? "global" : regions.length || countries.length > 1 ? "regional" : "local";
  const destination = scope === "global" ? "Global" : scope === "local" && countries[0] ? countryNameFromCode(countries[0]) : regions[0] || (countries[0] ? countryNameFromCode(countries[0]) : "MobiMatter");
  const unlimited = truthy(details.UNLIMITED);
  const slow = reducedSpeedMbps(details);
  const daily = isDailyAllowance(planText(details));
  const megabytes = dataMegabytes(details);
  const type: DataType = unlimited ? (megabytes > 0 && slow !== null ? "daily_throttled" : "unlimited") : daily ? (slow !== null ? "daily_throttled" : "daily_cutoff") : "total";
  const days = hoursToDays(details.PLAN_VALIDITY);
  const speeds = splitList(details.NETWORKS_SHORT ?? details.SPEED).map((speed) => speed.toUpperCase()).filter((speed) => /^\dG|LTE/.test(speed));
  const breakout = breakoutCountries(details.IP_BREAKOUT);
  return {
    providerPlanId: `${productId}|${category}`,
    sku: strOrNull(product.productFamilyId),
    name: str(details.PLAN_TITLE) || fallbackName(product, details),
    slug: `mobimatter-${slugify(productId)}`,
    productSlug: scope === "global" ? "global-esim" : `${slugify(destination)}-esim`,
    destination,
    emoji: null,
    coverage: {
      scope,
      countries: countries.map((code) => ({ code, name: countryNameFromCode(code) })),
      // The product list names no operator (productFamilyName is MobiMatter's product line, not a network): left empty.
      // The operators come from /products/{id}/networks when the storefront asks for them (CAT-10).
      networks: [],
      breakoutIp: breakout,
    },
    data: { megabytes, label: type === "unlimited" ? "Unlimited" : type.startsWith("daily") ? `${megabytesLabel(megabytes)}/day` : megabytesLabel(megabytes), type },
    fairUse: slow !== null && (unlimited || daily) ? { highSpeedGbPerDay: megabytes > 0 ? Math.round((megabytes / 1024) * 100) / 100 : null, reducedSpeedMbps: slow } : null,
    validityDays: days,
    duration: { configurable: false, defaultDays: days, minDays: days, maxDays: days },
    speed: [...new Set(speeds)],
    tethering: null,
    activation: { billingStarts: null, preInstallDays: preInstallDays(details) },
    // Add-ons are bought into the same product family as a package of their own.
    topup: truthy(details.TOPUP)
      ? { supported: true, type: "MobiMatter add-on", mode: "addon", stackTarget: null, window: "before_expiry", coverage: "same_area", profileRetentionDays: null }
      : { supported: false, type: null, mode: "none", stackTarget: null, window: null, coverage: null, profileRetentionDays: null },
    cost: { currency: currencyOf(product.currencyCode, "USD"), amountMinor: cents(product.wholesalePrice ?? product.retailPrice), billingUnit: "plan" },
    bundles: [],
    extras: { voiceMinutes: 0, smsCount: 0, refundable: false, phoneNumberIncluded: Boolean(str(details.PHONE_NUMBER_PREFIX)) },
    additionalInfo: strOrNull(details.ACTIVATION_POLICY),
    available: details.EXTERNALLY_SHOWN === undefined || truthy(details.EXTERNALLY_SHOWN),
    providerUpdatedAt: null,
    raw: product,
  };
}

function date(value: JsonValue | undefined): string | null {
  const text = str(value);
  if (!text) return null;
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function providerInfo(response: JsonObject): JsonObject {
  for (const candidate of [response.result, obj(response.providerInfo).data, obj(obj(response.result).providerInfo).data, response]) {
    const value = obj(candidate);
    if ("esim" in value || "packages" in value) return value;
  }
  return {};
}

function lifecycle(status: string, active: boolean, totalMb: number, usedMb: number, expiresAt: string | null): LifecycleStatus | null {
  const token = status.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  if (["CANCELLED", "CANCELED", "DELETED", "REVOKED"].includes(token)) return "cancelled";
  if (token === "USED_UP" || (totalMb > 0 && usedMb >= totalMb)) return "depleted";
  if (["USED_EXPIRED", "EXPIRED", "INACTIVE"].includes(token) || (expiresAt && Date.parse(expiresAt) <= Date.now())) return "expired";
  if (["INSTALLED", "ACTIVE", "IN_USE"].includes(token)) return "in_use";
  if (["AVAILABLE", "NOT_INSTALLED", "UNINSTALLED", "PROCESSING", "PENDING", "CREATED"].includes(token)) return "not_installed";
  return active ? "in_use" : null;
}

export function mapOrder(order: JsonObject, orderId: string): ProviderEsim {
  const line = obj(order.orderLineItem);
  const details = detailsOf(line.lineItemDetails);
  const activationCode = strOrNull(details.LOCAL_PROFILE_ASSISTANT) ?? strOrNull(details.ACTIVATION_CODE);
  const lpa = parseLpa(activationCode);
  return {
    providerEsimId: orderId,
    simId: null,
    iccid: strOrNull(details.ICCID),
    status: "fulfilled",
    usageAvailable: true,
    lifecycle: { status: null, profileStatus: null, installed: null, installationDetectedAt: null, activationDetectedAt: null },
    installation: {
      activationCode,
      smdpAddress: strOrNull(details.SMDP_ADDRESS) ?? lpa.smdpAddress,
      matchingId: lpa.matchingId,
      qrCodeUrl: strOrNull(details.QR_CODE),
      apn: strOrNull(details.ACCESS_POINT_NAME),
    },
    customerLink: strOrNull(details.KYC_URL),
    bundles: [],
    fulfilledAt: date(order.created),
    expiresAt: null,
    raw: order,
  };
}

/** MobiMatter product lines (`productFamilyName`) whose plans are sold; others are not synced. */
export const SOLD_FAMILIES = ["3HK"];

const familyKey = (value: string) => value.replace(/[^a-z0-9]/gi, "").toUpperCase();

/** Whether a MobiMatter product is from a product line we sell ("3HK", "3 HK"). */
export const soldFamily = (product: JsonObject) => SOLD_FAMILIES.map(familyKey).includes(familyKey(str(product.productFamilyName)));

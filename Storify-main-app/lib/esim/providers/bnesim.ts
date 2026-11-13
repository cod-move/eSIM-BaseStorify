import { countryNameFromCode } from "./countries";
import { requestJson, type FetchLike } from "./http";
import { int, iso2, megabytesLabel, num, obj, objArray, parseLpa, slugify, str, strOrNull } from "./json";
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
  type PurchaseContext,
  type PurchaseResult,
  type TopupInput,
  type TopupResult,
} from "./types";

/**
 * BNESIM enterprise API (https://api.bnesim.com/v2.0), ported from the live
 * esim_php adapter and the TypeScript rewrite's research.
 *
 * Form-encoded POSTs with a bearer token from /login. Buying is three steps
 * the supplier gives no idempotency key for — activate a license (one per
 * purchase, named by our idempotency key), add the eSIM product to it, read
 * the card — so each step runs from `queryPurchase` only after the job has
 * stored the previous step's reference (`providerOrderId`):
 *   purchase            → license activation           → "<licenseTxn>"
 *   queryPurchase(lic)  → license OK → add-esim         → "<esimTxn>|<licenseCli>"
 *   queryPurchase(esim) → eSIM OK → card with ICCID + QR → fulfilled
 * Before adding the eSIM it looks whether the license already holds a card,
 * so a retried step never buys a second one. Top-ups (recharge) have no key
 * either; `nonIdempotent.topup` tells the top-up job not to retry an
 * uncertain answer.
 */

const DEFAULT_BASE_URL = "https://api.bnesim.com/v2.0";
const LIFETIME_DAYS = 3650;
/** The product catalogue comes in one answer with no paging; it is far larger than other calls'. */
const CATALOGUE_MAX_BYTES = 64 * 1024 * 1024;

/** BNESIM unlimited plans: 3 GB a day at full speed, then 1 Mbps. */
const UNLIMITED_DAILY_MB = 3 * 1024;

/** Per account: the token, or the login still under way, so parallel calls log in once. */
const tokens = new Map<string, Promise<string>>();

export interface BnesimOptions {
  apiKey: string;
  apiSecret: string;
  /** Login type; "operator" for reseller accounts. */
  type?: string;
  /** Account currency (BNESIM prices carry none). */
  currency?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export class BnesimAdapter implements EsimProviderAdapter {
  readonly code = "bnesim";
  readonly displayName = "BNESIM";
  // getPlan reads the whole product list.
  readonly capabilities = { listPlans: true, purchase: true, usage: true, topup: true, cancel: false, planLookup: false } as const;
  readonly nonIdempotent = { topup: true } as const;

  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly loginType: string;
  private readonly currency: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(options: BnesimOptions) {
    this.apiKey = options.apiKey.trim();
    this.apiSecret = options.apiSecret.trim();
    if (!this.apiKey || !this.apiSecret) throw new ProviderError("credentials_missing", "BNESIM api key and secret are required");
    this.loginType = options.type?.trim() || "operator";
    this.currency = (options.currency ?? "USD").toUpperCase();
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
  }

  async probe() {
    const areas = await this.areas();
    return { message: "BNESIM credentials accepted", metadata: { areas: areas.length } as JsonObject };
  }

  /** Only the plans that never expire are sold from BNESIM; every other product is left out. */
  async *listPlans(): AsyncIterable<ProviderPlan> {
    const [products, areas] = await Promise.all([this.products(), this.areas()]);
    const index = areaIndex(areas);
    for (const product of products) {
      if (!isLifetime(product)) continue;
      const plan = mapProduct(product, index, this.currency);
      if (plan) yield plan;
    }
  }

  async getPlan(providerPlanId: string) {
    const [products, areas] = await Promise.all([this.products(), this.areas()]);
    const product = products.find((row) => str(row.id) === providerPlanId);
    return product ? mapProduct(product, areaIndex(areas), this.currency) : null;
  }

  /** Step 1: a license for this purchase. The rest follows from `queryPurchase`. */
  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const activation = await this.call("/enterprise/license/activation", { name: input.idempotencyKey.slice(0, 60) });
    const transaction = transactionOf(activation);
    return { status: "processing", providerOrderId: `${transaction}#${input.providerPlanId}`, charged: null, esim: null, raw: activation };
  }

  async queryPurchase(providerOrderId: string, context: PurchaseContext = {}): Promise<PurchaseResult> {
    const ref = parseOrderId(providerOrderId);
    const status = await this.activationStatus(ref.transaction);
    const pending = (raw: JsonObject, id = providerOrderId): PurchaseResult => ({ status: "processing", providerOrderId: id, charged: null, esim: null, raw });
    if (status.state === "FAILED") throw new ProviderError("rejected", `BNESIM ${ref.licenseCli ? "eSIM" : "license"} activation failed`);
    if (status.state !== "OK") return pending(status.raw);

    let licenseCli = ref.licenseCli;
    if (!licenseCli) {
      // Step 2: the license is ready. A card already on it means the eSIM was added by an earlier attempt.
      licenseCli = str(status.raw.license_cli);
      if (!licenseCli) return pending(status.raw);
      const existing = findCard(await this.cards(licenseCli), ref.planId);
      if (!existing) {
        // A start date the shopper chose (ORD-03) goes with the eSIM, not the license.
        const added = await this.call("/enterprise/simcard/add-esim", {
          license_cli: licenseCli,
          product_id: ref.planId,
          ...(context.activationDate ? { scheduled_activation_date: context.activationDate } : {}),
        });
        return pending(added, `${transactionOf(added)}|${licenseCli}#${ref.planId}`);
      }
    }

    // Step 3: the card, once it has an ICCID and an activation code.
    const card = findCard(await this.cards(licenseCli), ref.planId);
    const iccid = card ? str(card.iccid) : "";
    if (!iccid) return pending(status.raw);
    const detail = simcardOf(await this.detail(iccid));
    const esim = mapCard(detail, licenseCli);
    if (!esim.installation.activationCode) return pending(withoutCatalogue(detail));
    return { status: "fulfilled", providerOrderId, charged: null, esim, raw: withoutCatalogue(detail) };
  }

  async getEsim(ref: EsimRef) {
    const detail = simcardOf(await this.detail(iccidOf(ref)));
    return mapCard(detail, str(detail.license_cli) || null);
  }

  async getUsage(ref: EsimRef): Promise<ProviderUsage> {
    const detail = simcardOf(await this.detail(iccidOf(ref)));
    // The card's own data is in `data_credit_details`. `products` (only with
    // with_products=1) is the catalogue the card could buy, not what it holds.
    const credits = dataCredits(detail.data_credit_details);
    const totalMb = credits.reduce((sum, credit) => sum + firstNumber(credit, ["total", "total_mb", "total_volume", "volume", "data_total"]), 0);
    const remainingMb = credits.length
      ? credits.reduce((sum, credit) => sum + firstNumber(credit, ["remaining", "remaining_mb", "remaining_volume", "volume_remaining", "available_volume"]), 0)
      : totalMb;
    const totalBytes = Math.round(totalMb * 1024 * 1024);
    const remainingBytes = Math.round(Math.max(0, Math.min(remainingMb, totalMb || remainingMb)) * 1024 * 1024);
    const expiresAt = expiryOf(detail);
    return {
      totalBytes,
      usedBytes: Math.max(totalBytes - remainingBytes, 0),
      remainingBytes,
      lifecycleStatus: lifecycle(detail, totalMb, remainingMb, expiresAt),
      expiresAt,
      syncedAt: null,
      stale: null,
      raw: withoutCatalogue(detail),
    };
  }

  /**
   * Products the card can be recharged with: the whole catalogue BNESIM
   * offers for this card (get-detail with_products=1, the one call that asks
   * for it). A BNESIM card can take data for any country, not only the one
   * it was bought for, so nothing is left out by country.
   */
  async listTopupPlans(ref: EsimRef): Promise<ProviderTopupPlan[]> {
    const detail = simcardOf(await this.detail(iccidOf(ref), true));
    const licenseCli = str(detail.license_cli);
    const seen = new Set<string>();
    return objArray(detail.products).flatMap((product) => {
      const id = str(product.id);
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [{
        topupPlanId: licenseCli ? `${id}|${licenseCli}` : id,
        name: str(product.name) || id,
        megabytes: Math.round(num(product.volume) ?? 0),
        validityDays: validityDays(product),
        cost: { currency: this.currency, amountMinor: cents(product.price) },
        raw: product,
      }];
    });
  }

  async topup(input: TopupInput): Promise<TopupResult> {
    const [productId, cli] = input.topupPlanId.split("|");
    const iccid = iccidOf(input.esim);
    const licenseCli = cli || str(simcardOf(await this.detail(iccid)).license_cli);
    if (!licenseCli) throw new ProviderError("not_found", "BNESIM did not say which license the card belongs to");
    const result = await this.call("/enterprise/simcard/recharge", { iccid, product_id: productId, license_cli: licenseCli });
    return {
      status: "completed",
      providerTopupId: str(result.activationTransaction) || str(result.transaction_id) || input.idempotencyKey,
      raw: result,
    };
  }

  /** Not in BNESIM's public API: an admin cancels on their portal. */
  async cancel(): Promise<CancelResult> {
    return { status: "not_supported", raw: { message: "BNESIM cancellation is not in its public API" } };
  }

  private async areas() {
    return objArray((await this.call("/enterprise/products/get-regions-countries", undefined, "GET")).areas);
  }

  /** The whole catalogue: one answer, larger than any other call's (well over 8 MB). */
  private async products() {
    return objArray((await this.call("/enterprise/products/get-products", {}, "POST", true, CATALOGUE_MAX_BYTES)).products);
  }

  private async cards(licenseCli: string) {
    return objArray(obj((await this.call("/enterprise/simcard/get-all", { license_cli: licenseCli })).data).sim_cards);
  }

  /**
   * One card. Without `withProducts` the catalogue BNESIM would add (about
   * 1.7 MB, the same for every card) is left out: the answer is a few KB, and
   * what is kept of it on the eSIM (`raw`) stays that size.
   */
  private async detail(iccid: string, withProducts = false) {
    return this.call(
      "/enterprise/simcard/get-detail",
      { iccid, with_products: withProducts ? "1" : "0" },
      "POST",
      true,
      withProducts ? CATALOGUE_MAX_BYTES : undefined,
    );
  }

  private async activationStatus(transaction: string) {
    const raw = await this.call("/enterprise/activation-transaction/get-status", { activationTransaction: transaction });
    return { state: str(raw.activation_status).toUpperCase() || "PENDING", raw };
  }

  private async call(path: string, form?: Record<string, string>, method: "GET" | "POST" = "POST", retry = true, maxBytes?: number): Promise<JsonObject> {
    const { ok, status, body } = await requestJson(this.fetcher, {
      method,
      url: `${this.baseUrl}${path}`,
      headers: { Authorization: `Bearer ${await this.token()}` },
      ...(method === "POST" ? { form: form ?? {} } : {}),
      ...(maxBytes ? { maxBytes, timeoutMs: 120_000 } : {}),
    });
    if (status === 401 && retry) {
      tokens.delete(this.apiKey);
      return this.call(path, form, method, false, maxBytes);
    }
    if (!ok) {
      throw new ProviderError(status >= 500 ? "uncertain" : "rejected", `BNESIM ${path} failed with HTTP ${status}${str(body.message) ? `: ${str(body.message)}` : ""}`, status);
    }
    if (body.success === false) throw new ProviderError("rejected", `BNESIM ${path} refused: ${str(body.message) || str(body.error) || "no reason given"}`);
    return body;
  }

  private token(): Promise<string> {
    let pending = tokens.get(this.apiKey);
    if (!pending) {
      pending = this.login();
      tokens.set(this.apiKey, pending);
      // A failed login is not kept: the next call tries again.
      pending.catch(() => tokens.delete(this.apiKey));
    }
    return pending;
  }

  private async login(): Promise<string> {
    const { ok, body } = await requestJson(this.fetcher, {
      method: "POST",
      url: `${this.baseUrl}/login`,
      form: { api_key: this.apiKey, api_secret: this.apiSecret, type: this.loginType },
      timeoutMs: 20_000,
    });
    const token = str(body.token) || str(obj(body.data).token);
    if (!ok || !token) throw new ProviderError("credentials_missing", "BNESIM login was refused");
    return token;
  }
}

function transactionOf(response: JsonObject): string {
  const data = obj(response.data);
  const id = str(response.activationTransaction) || str(response.activation_transaction) || str(data.activationTransaction) || str(data.activation_transaction);
  if (!id) throw new ProviderError("invalid_response", "BNESIM returned no activation transaction");
  return id;
}

/** "<txn>[|<licenseCli>]#<planId>" — the stage reached, and the product being bought. */
export function parseOrderId(providerOrderId: string) {
  const [stage, planId = ""] = providerOrderId.split("#");
  const [transaction, licenseCli] = stage.split("|");
  if (!transaction || !planId) throw new ProviderError("not_found", "Not a BNESIM purchase reference");
  return { transaction, licenseCli: licenseCli || null, planId };
}

function findCard(cards: JsonObject[], planId: string): JsonObject | null {
  return (
    cards.find((card) => objArray(card.products).some((product) => str(product.id) === planId)) ??
    (cards.length === 1 ? cards[0] : null)
  );
}

function iccidOf(ref: EsimRef): string {
  const iccid = ref.iccid ?? ref.providerEsimId;
  if (!iccid) throw new ProviderError("not_found", "BNESIM addresses a card by its ICCID");
  return iccid;
}

function simcardOf(response: JsonObject): JsonObject {
  const data = obj(response.data);
  for (const candidate of [data.simcard_details, data.simcardDetails, response.simcard_details, response.simcardDetails]) {
    const value = obj(candidate);
    if (Object.keys(value).length) return value;
  }
  return {};
}

function cents(value: JsonValue | undefined) {
  const amount = num(value);
  return amount !== null && amount > 0 ? Math.round(amount * 100) : 0;
}

function firstNumber(value: JsonObject, keys: string[]): number {
  for (const key of keys) {
    const parsed = num(value[key]);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return 0;
}

/** `data_credit_details` is a list, one credit, or credits nested by country and validity. */
function dataCredits(value: JsonValue | undefined): JsonObject[] {
  const list = objArray(value);
  if (list.length) return list;
  const isCredit = (entry: JsonObject) =>
    ["total", "total_mb", "volume", "remaining", "remaining_mb", "expiration_date", "expires_at"].some((key) => entry[key] !== undefined);
  const root = obj(value);
  if (!Object.keys(root).length) return [];
  if (isCredit(root)) return [root];
  const credits: JsonObject[] = [];
  for (const country of Object.values(root).map(obj)) {
    if (isCredit(country)) credits.push(country);
    else for (const credit of Object.values(country).map(obj)) if (isCredit(credit)) credits.push(credit);
  }
  return credits;
}

function date(value: JsonValue | undefined): string | null {
  const text = str(value);
  if (!text) return null;
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** The latest expiry among the card's credits, else the card's own. */
function expiryOf(card: JsonObject): string | null {
  const fromCredits = dataCredits(card.data_credit_details)
    .map((credit) => date(credit.expiration_date ?? credit.expiry_date ?? credit.expires_at ?? credit.expiration))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  return fromCredits ?? date(card.expiration_date ?? card.expiry_date);
}

function lifecycle(card: JsonObject, totalMb: number, remainingMb: number, expiresAt: string | null): LifecycleStatus | null {
  const status = (str(card.simcard_status) || str(card.status) || str(card.esim_status)).toUpperCase();
  if (["CANCELLED", "CANCELED", "DELETED", "REVOKED"].includes(status)) return "cancelled";
  if (status === "USED_UP") return "depleted";
  if (status === "EXPIRED" || (expiresAt && Date.parse(expiresAt) <= Date.now())) return "expired";
  if (totalMb > 0 && remainingMb <= 0) return "depleted";
  if (["ACTIVE", "IN_USE", "ENABLED"].includes(status)) return "in_use";
  if (["PENDING", "PROCESSING", "CREATED", "RELEASED"].includes(status)) return "not_installed";
  return null;
}

function activationCodeOf(card: JsonObject): string | null {
  const lpa = (value: JsonValue | undefined) => {
    const text = str(value);
    return /^LPA:1\$[^$]+\$[^$]+$/i.test(text) ? text : null;
  };
  const fromLink = (value: JsonValue | undefined) => {
    try {
      return lpa(new URL(str(value)).searchParams.get("carddata") ?? undefined);
    } catch {
      return null;
    }
  };
  const smdp = str(card.smdp_address).replace(/^LPA:1\$/i, "").replace(/\$+$/, "");
  const matching = str(card.matching_id);
  return lpa(card.qr_code) ?? fromLink(card.ios_universal_installation_link) ?? fromLink(card.android_universal_installation_link) ?? (smdp && matching ? `LPA:1$${smdp}$${matching}` : null);
}

export function mapCard(card: JsonObject, licenseCli: string | null): ProviderEsim {
  const activationCode = activationCodeOf(card);
  const lpa = parseLpa(activationCode);
  const expiresAt = expiryOf(card);
  return {
    providerEsimId: strOrNull(card.iccid),
    simId: licenseCli,
    iccid: strOrNull(card.iccid),
    status: "fulfilled",
    usageAvailable: true,
    lifecycle: {
      status: lifecycle(card, 0, 0, expiresAt),
      profileStatus: null,
      installed: typeof card.is_installed === "boolean" ? card.is_installed : null,
      installationDetectedAt: null,
      activationDetectedAt: null,
    },
    installation: {
      activationCode,
      smdpAddress: lpa.smdpAddress,
      matchingId: lpa.matchingId,
      qrCodeUrl: strOrNull(card.qr_code_image),
      apn: strOrNull(card.apn),
    },
    customerLink: strOrNull(card.ios_universal_installation_link) ?? strOrNull(card.android_universal_installation_link),
    bundles: [],
    fulfilledAt: null,
    expiresAt,
    raw: withoutCatalogue(card),
  };
}

/** A card as kept on the eSIM: never the catalogue an answer may carry beside it. */
function withoutCatalogue(card: JsonObject): JsonObject {
  if (!("products" in card)) return card;
  const { products: _catalogue, ...rest } = card;
  void _catalogue;
  return rest;
}

interface AreaIndex {
  countryByName: Map<string, string>;
  regions: Map<string, string>;
}

function areaIndex(areas: JsonObject[]): AreaIndex {
  const index: AreaIndex = { countryByName: new Map(), regions: new Map() };
  for (const area of areas) {
    const code = str(area.country_iso2);
    const name = str(area.country_name) || code;
    if (iso2(code)) index.countryByName.set(name.toLowerCase(), code.toUpperCase());
    else if (name) index.regions.set(name.toLowerCase(), name);
  }
  return index;
}

/** The product's countries — from its coverage list, else its region names — and region names that are not countries. */
function coverageOf(product: JsonObject, index: AreaIndex): { countries: string[]; regions: string[] } {
  const listed = objArray(product.product_coverage).map((entry) => iso2(entry.country_iso2)).filter((code): code is string => Boolean(code));
  if (listed.length) return { countries: [...new Set(listed)], regions: [] };
  const countries: string[] = [];
  const regions: string[] = [];
  for (const token of str(product.region_names).split(/[,;|]/).map((part) => part.trim()).filter(Boolean)) {
    const code = iso2(token) ?? index.countryByName.get(token.toLowerCase());
    if (code) countries.push(code);
    else regions.push(index.regions.get(token.toLowerCase()) ?? token);
  }
  return { countries: [...new Set(countries)], regions: [...new Set(regions)] };
}

/** A plan that never expires: BNESIM says so in its validity label, or it runs 180 days or more (as the old store judged). */
export function isLifetime(product: JsonObject) {
  const label = str(product.validity_label).toLowerCase();
  return /no expir|lifetime/.test(label) || (int(product.duration) ?? 0) >= 180;
}

function validityDays(product: JsonObject) {
  return isLifetime(product) ? LIFETIME_DAYS : Math.max(int(product.duration) ?? 0, 0);
}

export function mapProduct(product: JsonObject, index: AreaIndex, currency: string): ProviderPlan | null {
  const id = str(product.id);
  if (!id) return null;
  const coverage = coverageOf(product, index);
  const regionText = `${str(product.region_names)} ${coverage.regions.join(" ")}`.toLowerCase();
  const scope: CoverageScope = /global|world/.test(regionText) ? "global" : coverage.regions.length || coverage.countries.length > 1 ? "regional" : "local";
  const destination =
    scope === "global" ? "Global" : scope === "local" && coverage.countries[0] ? countryNameFromCode(coverage.countries[0]) : coverage.regions[0] || str(product.region_names) || "BNESIM";
  const unlimited = product.unlimited === true || str(product.unlimited) === "1" || str(product.unlimited).toLowerCase() === "true";
  const lifetime = isLifetime(product);
  const days = validityDays(product);
  const megabytes = unlimited ? UNLIMITED_DAILY_MB : Math.round(num(product.volume) ?? 0);
  const type: DataType = lifetime ? "lifetime" : unlimited ? "daily_throttled" : "total";
  return {
    providerPlanId: id,
    sku: null,
    name: str(product.name) || id,
    slug: `bnesim-${slugify(id)}`,
    productSlug: scope === "global" ? "global-esim" : `${slugify(destination)}-esim`,
    destination,
    emoji: null,
    coverage: {
      scope,
      countries: coverage.countries.map((code) => ({ code, name: countryNameFromCode(code) })),
      // BNESIM names no operators (its `provider` is not one): left empty, shown as "not stated".
      networks: [],
      breakoutIp: [],
    },
    data: { megabytes, label: unlimited ? "Unlimited" : megabytesLabel(megabytes), type },
    fairUse: unlimited ? { highSpeedGbPerDay: 3, reducedSpeedMbps: 1 } : null,
    validityDays: days,
    duration: { configurable: false, defaultDays: days, minDays: days, maxDays: days },
    speed: [],
    tethering: null,
    activation: { billingStarts: null, preInstallDays: null },
    // A recharge adds another product to the same card, which stays usable meanwhile.
    topup: { supported: true, type: "BNESIM recharge", mode: "addon", stackTarget: null, window: "while_profile_exists", coverage: "any_area", profileRetentionDays: null },
    cost: { currency, amountMinor: cents(product.price), billingUnit: "plan" },
    bundles: [],
    extras: { voiceMinutes: Math.round(num(product.minutes) ?? 0), smsCount: int(product.sms) ?? 0, refundable: false, phoneNumberIncluded: false },
    additionalInfo: strOrNull(product.description) ?? strOrNull(product.validity_label),
    available: true,
    providerUpdatedAt: null,
    raw: product,
  };
}

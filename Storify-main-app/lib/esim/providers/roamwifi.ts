import { createHash } from "node:crypto";
import { countryCodeFromName } from "./countries";
import { requestJson, type FetchLike } from "./http";
import {
  int,
  megabytesLabel,
  num,
  obj,
  objArray,
  parseLpa,
  slugify,
  str,
  strOrNull,
} from "./json";
import {
  ProviderError,
  type CancelResult,
  type CoverageScope,
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
 * RoamWifi BPM API (https://bpm.roamwifi.hk), ported from the live esim_php
 * adapter.
 *
 * Form-encoded POSTs signed with an MD5 over the sorted parameters; a login
 * token (cached ~110 min, refreshed once on code -1) rides every call. The
 * catalogue is SKUs (a destination) each holding packages (an `apiCode` = a
 * plan). Countries arrive as English names only. An eSIM is addressed by the
 * order number that bought it plus its ICCID, so `providerEsimId` holds that
 * order number.
 *
 * Top-ups ("renew") add a separate package to the card; the default rule below
 * says so, and is overridable per provider until RoamWifi confirms the
 * renewal window in writing.
 */

const DEFAULT_BASE_URL = "https://bpm.roamwifi.hk";
/** RoamWifi's published signing key; overridable if they issue a private one. */
const DEFAULT_SIGN_KEY = "1234567890qwertyuiopasdfghjklzxc";
const TOKEN_TTL_MS = 110 * 60 * 1000;
const BYTES = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } as const;

const tokens = new Map<string, { token: string; expiresAt: number }>();

export interface RoamWifiOptions {
  phoneNumber: string;
  password: string;
  /** Settlement currency of the account (RoamWifi does not say per package). */
  currency?: string;
  signKey?: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export class RoamWifiAdapter implements EsimProviderAdapter {
  readonly code = "roamwifi";
  readonly displayName = "RoamWifi";
  readonly capabilities = {
    listPlans: true,
    purchase: true,
    usage: true,
    topup: true,
    cancel: true,
    // getPlan walks the whole catalogue.
    planLookup: false,
  } as const;

  private readonly phoneNumber: string;
  private readonly password: string;
  private readonly currency: string;
  private readonly signKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(options: RoamWifiOptions) {
    this.phoneNumber = options.phoneNumber.trim();
    this.password = options.password;
    if (!this.phoneNumber || !this.password) {
      throw new ProviderError("credentials_missing", "RoamWifi phone number and password are required");
    }
    this.currency = (options.currency ?? "USD").toUpperCase();
    this.signKey = options.signKey || DEFAULT_SIGN_KEY;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
  }

  async probe() {
    const skus = await this.callList("api_esim/getSkus");
    return { message: "RoamWifi credentials accepted", metadata: { skus: skus.length } as JsonObject };
  }

  async *listPlans(): AsyncIterable<ProviderPlan> {
    for (const sku of await this.callList("api_esim/getSkus")) {
      const skuId = str(sku.skuid);
      if (!skuId) continue;
      const packageData = obj(await this.callData("api_esim/getPackages", { skuId }));
      for (const plan of mapSkuPlans(sku, packageData, this.currency)) yield plan;
    }
  }

  /** RoamWifi has no single-plan read; availability is its stock check. */
  async getPlan(providerPlanId: string) {
    const available = await this.callData("api_esim/verifyResourceByApiCode", {
      apiCode: providerPlanId,
      count: "1",
    });
    if (int(available) !== 1) return null;
    for await (const plan of this.listPlans()) {
      if (plan.providerPlanId === providerPlanId) return plan;
    }
    return null;
  }

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const order = obj(
      await this.callData("api_esim/addEsimOrderByApiCode", {
        apiCode: input.providerPlanId,
        count: "1",
        otherOrderId: input.idempotencyKey,
        otherItemId: input.idempotencyKey,
        backInfo: "1",
        isSendEmail: "0",
        pdfLanguage: "en-US",
      }),
    );
    const orderNum = str(order.orderNum);
    if (!orderNum) throw new ProviderError("invalid_response", "RoamWifi order returned no order number");
    if (objArray(order.cardApiDtoList).length) return this.orderResult(orderNum, order);
    return this.queryPurchase(orderNum);
  }

  async queryPurchase(providerOrderId: string): Promise<PurchaseResult> {
    const order = obj(await this.callData("api_esim/getOrderInfo", { orderNum: providerOrderId }));
    return this.orderResult(providerOrderId, order);
  }

  async getEsim(ref: EsimRef) {
    const order = await this.cardOrder(ref);
    const card = objArray(order.cardApiDtoList)[0];
    if (!card) throw new ProviderError("not_found", "RoamWifi returned no card for the order");
    return mapCard(card, order);
  }

  async getUsage(ref: EsimRef): Promise<ProviderUsage> {
    const order = await this.cardOrder(ref);
    const card = objArray(order.cardApiDtoList)[0] ?? {};
    const unit = str(card.unit) || str(order.unit) || "GB";
    const totalBytes = bytes(card.flows ?? order.flows, unit) ?? 0;
    const usedBytes = bytes(card.usedMb ?? card.usedMB ?? order.usedMb, "MB");
    const remainingBytes =
      bytes(card.remainingMb ?? card.remainingMB ?? order.remainingMb, "MB") ??
      Math.max(totalBytes - (usedBytes ?? 0), 0);
    return {
      totalBytes,
      usedBytes: usedBytes ?? Math.max(totalBytes - remainingBytes, 0),
      remainingBytes,
      lifecycleStatus: lifecycle(str(card.dpStatus), date(card.endDate ?? order.endDate)),
      expiresAt: date(card.endDate ?? order.endDate),
      syncedAt: null,
      stale: null,
      raw: order,
    };
  }

  async listTopupPlans(ref: EsimRef): Promise<ProviderTopupPlan[]> {
    if (!ref.iccid) throw new ProviderError("not_found", "RoamWifi lists renewals by ICCID");
    const plans = new Map<string, ProviderTopupPlan>();
    for (const sku of await this.callList("api_esim/getICCIDSupportSkuInfo", { iccid: ref.iccid })) {
      const packageData = obj(
        await this.callData("api_esim/getICCIDSkuSupportPackageInfo", {
          iccid: ref.iccid,
          skuId: str(sku.skuid),
        }),
      );
      const display = str(packageData.displayEn) || str(packageData.display) || str(sku.display);
      for (const pkg of objArray(packageData.esimPackageDtoList)) {
        const apiCode = str(pkg.apiCode) || str(pkg.apicode);
        if (!apiCode) continue;
        plans.set(apiCode, {
          topupPlanId: apiCode,
          name: planName(display, pkg),
          megabytes: Math.round((bytes(pkg.flows, str(pkg.unit) || "GB") ?? 0) / BYTES.MB),
          validityDays: int(pkg.days) ?? 0,
          cost: { currency: this.currency, amountMinor: cents(pkg.price) },
          raw: pkg,
        });
      }
    }
    return [...plans.values()];
  }

  async topup(input: TopupInput): Promise<TopupResult> {
    if (!input.esim.iccid) throw new ProviderError("not_found", "RoamWifi renews by ICCID");
    const result = obj(
      await this.callData("api_esim/renewCardByApiCode", {
        iccid: input.esim.iccid,
        apiCode: input.topupPlanId,
        otherOrderId: input.idempotencyKey,
        otherItemId: input.idempotencyKey,
        backInfo: "1",
        pdfLanguage: "en-US",
      }),
    );
    return {
      status: "completed",
      providerTopupId: str(result.orderNum) || input.idempotencyKey,
      raw: result,
    };
  }

  async cancel(ref: EsimRef): Promise<CancelResult> {
    if (!ref.providerEsimId || !ref.iccid) {
      throw new ProviderError("not_found", "RoamWifi refunds by order number and ICCID");
    }
    const result = await this.callRaw("api_esim/refundOrder", {
      orderNum: ref.providerEsimId,
      iccids: ref.iccid,
      remark: "Cancelled by platform",
    });
    return { status: "cancelled", raw: result };
  }

  private orderResult(orderNum: string, order: JsonObject): PurchaseResult {
    const card = objArray(order.cardApiDtoList)[0];
    const priceCents = num(order.price) !== null ? cents(order.price) : null;
    const charged = priceCents !== null ? { currency: this.currency, amountMinor: priceCents } : null;
    if (!card || !str(card.iccid)) {
      return { status: "processing", providerOrderId: orderNum, charged, esim: null, raw: order };
    }
    return { status: "fulfilled", providerOrderId: orderNum, charged, esim: mapCard(card, order), raw: order };
  }

  /** The card's live state: the PDF re-issue returns fresher fields than order info. */
  private async cardOrder(ref: EsimRef): Promise<JsonObject> {
    const orderNum = ref.providerEsimId;
    if (!orderNum) throw new ProviderError("not_found", "RoamWifi needs the order number of the eSIM");
    try {
      const reissued = obj(await this.callData("api_esim/reDownOrderPDF", { orderNum, backInfo: "1" }));
      if (objArray(reissued.cardApiDtoList).length) return reissued;
    } catch (error) {
      if (!(error instanceof ProviderError) || error.code === "credentials_missing") throw error;
    }
    return obj(await this.callData("api_esim/getOrderInfo", { orderNum }));
  }

  private async callData(endpoint: string, payload: Record<string, string> = {}): Promise<JsonValue> {
    return (await this.callRaw(endpoint, payload)).data ?? null;
  }

  private async callList(endpoint: string, payload: Record<string, string> = {}): Promise<JsonObject[]> {
    return objArray(await this.callData(endpoint, payload));
  }

  private async callRaw(
    endpoint: string,
    payload: Record<string, string>,
    retry = true,
  ): Promise<JsonObject> {
    const params = { ...payload, token: await this.token() };
    const { ok, status, body } = await requestJson(this.fetcher, {
      method: "POST",
      url: `${this.baseUrl}/${endpoint}`,
      form: { ...params, sign: sign(params, this.signKey) },
    });
    if (!ok) {
      throw new ProviderError(
        status >= 500 ? "uncertain" : "rejected",
        `RoamWifi ${endpoint} failed with HTTP ${status}`,
        status,
      );
    }
    const code = str(body.code ?? body.Code);
    if (code === "-1" && retry) {
      tokens.delete(this.phoneNumber);
      return this.callRaw(endpoint, payload, false);
    }
    if (code !== "0") {
      throw new ProviderError(
        "rejected",
        `RoamWifi ${endpoint} refused: ${str(body.message) || `code ${code || "missing"}`}`,
        null,
        code || null,
      );
    }
    return body;
  }

  private async token(): Promise<string> {
    const cached = tokens.get(this.phoneNumber);
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    const params = { phonenumber: this.phoneNumber, password: this.password };
    const { body } = await requestJson(this.fetcher, {
      method: "POST",
      url: `${this.baseUrl}/api_order/login`,
      form: { ...params, sign: sign(params, this.signKey) },
      timeoutMs: 20_000,
    });
    const token = str(obj(body.data).token);
    if (int(body.Code ?? body.code) !== 1 || !token) {
      throw new ProviderError("credentials_missing", "RoamWifi login was refused");
    }
    tokens.set(this.phoneNumber, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
    return token;
  }
}

/** PHP rawurlencode: everything but A-Z a-z 0-9 - _ . ~ is percent-encoded. */
function rawUrlEncode(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Upper-case MD5 of rawurlencode(sorted "k=v" pairs joined + key); empty values are skipped. */
export function sign(params: Record<string, string>, signKey: string) {
  const pairs = Object.entries(params)
    .filter(([key, value]) => key !== "sign" && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .sort();
  return createHash("md5").update(rawUrlEncode(pairs.join("") + signKey)).digest("hex").toUpperCase();
}

function cents(value: JsonValue | undefined) {
  const amount = num(value);
  return amount !== null && amount > 0 ? Math.round(amount * 100) : 0;
}

/** "G", "GB", "GiB" → bytes per unit; anything unrecognised reads as MB. */
function unitOf(unit: string): number {
  const letter = unit.trim().toUpperCase().charAt(0);
  if (letter === "K") return BYTES.KB;
  if (letter === "G") return BYTES.GB;
  if (letter === "T") return BYTES.TB;
  if (letter === "B") return BYTES.B;
  return BYTES.MB;
}

function bytes(value: JsonValue | undefined, defaultUnit: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Math.round(value * unitOf(defaultUnit));
  const text = str(value);
  const match = text.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/i);
  if (match) return Math.round(Number(match[1]) * unitOf(match[2]));
  const amount = num(text);
  return amount === null ? null : Math.round(amount * unitOf(defaultUnit));
}

/** "2026-11-01 10:00:00 (GMT+08:00)" and friends → ISO, or null. */
function date(value: JsonValue | undefined): string | null {
  const text = str(value)
    .replace(/\s*\(GMT[^)]*\)\s*/i, "")
    .replace(/\.(\d+)\s*$/, "");
  if (!text) return null;
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** dpStatus codes as the esim_php adapter learned them from live traffic. */
function lifecycle(dpStatus: string, expiresAt: string | null): LifecycleStatus | null {
  const token = dpStatus.toUpperCase().replace(/[^A-Z0-9-]+/g, "_");
  if (["2", "3", "5", "COMPLETED", "ENDED", "INVALID", "EXPIRED", "USED_EXPIRED", "UNUSED_EXPIRED"].includes(token)) {
    return "expired";
  }
  if (token === "USED_UP") return "depleted";
  if (["1", "4", "6", "7", "BLOCK", "BLOCKED", "DISABLE", "DISABLED", "CLOSED", "CANCEL", "CANCELED", "CANCELLED", "DELETE", "DELETED", "REVOKED"].includes(token)) {
    return "cancelled";
  }
  if (["0", "INUSE", "IN_USE", "ACTIVE", "ACTIVATED", "USING", "USED", "OPEN", "ENABLE", "ENABLED"].includes(token)) {
    return "in_use";
  }
  if (["INSTALLED", "DOWNLOAD", "DOWNLOADED"].includes(token)) return "installed";
  if (["-1", "AVAILABLE", "NOT_INSTALLED", "UNINSTALLED", "CREATED", "RELEASED", "PENDING"].includes(token)) {
    return "not_installed";
  }
  if (expiresAt && Date.parse(expiresAt) < Date.now()) return "expired";
  return null;
}

function mapCard(card: JsonObject, order: JsonObject): ProviderEsim {
  const activationCode = strOrNull(card.code) ?? strOrNull(card.activationCode);
  const lpa = parseLpa(activationCode);
  const expiresAt = date(card.endDate ?? order.endDate);
  return {
    providerEsimId: strOrNull(order.orderNum),
    simId: null,
    iccid: strOrNull(card.iccid),
    status: "fulfilled",
    usageAvailable: true,
    lifecycle: {
      status: lifecycle(str(card.dpStatus), expiresAt),
      profileStatus: null,
      installed: null,
      installationDetectedAt: null,
      activationDetectedAt: date(card.startDate),
    },
    installation: {
      activationCode,
      smdpAddress: strOrNull(card.sm_dp_address) ?? lpa.smdpAddress,
      matchingId: lpa.matchingId ?? strOrNull(card.activationCode),
      qrCodeUrl: strOrNull(card.pdfUrl),
      apn: strOrNull(card.apn),
    },
    customerLink: strOrNull(card.pdfUrl),
    bundles: [],
    fulfilledAt: null,
    expiresAt,
    raw: card,
  };
}

function planName(display: string, pkg: JsonObject) {
  const showName = str(pkg.showName);
  if (showName) return showName;
  return `${display} ${str(pkg.flows)}${(str(pkg.unit) || "GB").toUpperCase()}/${str(pkg.days)} Days`.trim();
}

function countriesOf(packageData: JsonObject) {
  const names = [
    ...objArray(packageData.countryImageUrlDtoList).map((country) => str(country.nameEn) || str(country.name)),
    ...(Array.isArray(packageData.supportCountry) ? packageData.supportCountry.map((name) => str(name)) : []),
  ].filter(Boolean);
  const countries = new Map<string, string>();
  for (const name of names) {
    const code = countryCodeFromName(name);
    if (code && !countries.has(code)) countries.set(code, name);
  }
  return [...countries].map(([code, name]) => ({ code, name }));
}

function scopeOf(display: string, sku: JsonObject, countryCount: number): CoverageScope {
  const text = display.toLowerCase();
  if (/global|world/.test(text)) return "global";
  if (countryCount > 1) return "regional";
  // RoamWifi numbers regional SKUs from 1000 up.
  const countryCode = num(sku.countryCode);
  return countryCode !== null && countryCode >= 1000 ? "regional" : "local";
}

export function mapSkuPlans(sku: JsonObject, packageData: JsonObject, currency: string): ProviderPlan[] {
  const display = str(packageData.displayEn) || str(packageData.display) || str(sku.display) || "RoamWifi";
  const countries = countriesOf(packageData);
  const scope = scopeOf(display, sku, countries.length);
  const productSlug = scope === "global" ? "global-esim" : `${slugify(display)}-esim`;

  return objArray(packageData.esimPackageDtoList).flatMap((pkg): ProviderPlan[] => {
    const apiCode = str(pkg.apiCode) || str(pkg.apicode);
    if (!apiCode) return [];
    const days = int(pkg.days) ?? 0;
    const megabytes = Math.round((bytes(pkg.flows, str(pkg.unit) || "GB") ?? 0) / BYTES.MB);
    const daypass = (int(pkg.supportDaypass) ?? 0) > 0;
    const networks = objArray(pkg.networkDtoList);
    const reloadable = int(pkg.flowType) === 0;
    return [{
      providerPlanId: apiCode,
      sku: str(sku.skuid) || null,
      name: planName(display, pkg),
      slug: `roamwifi-${slugify(apiCode)}`,
      productSlug,
      destination: display,
      emoji: null,
      coverage: {
        scope,
        countries,
        networks: networks
          .map((network) => ({
            countryCode: countries.length === 1 ? countries[0].code : "",
            operator: str(network.operator) || str(network.name),
            network: strOrNull(network.type),
          }))
          .filter((network) => network.operator),
        breakoutIp: [],
      },
      data: {
        megabytes,
        label: megabytesLabel(megabytes),
        // RoamWifi says only that a day-pass resets daily, not what happens
        // past the daily allowance; "throttled" is the common case.
        type: daypass ? "daily_throttled" : "total",
      },
      fairUse: null,
      validityDays: days,
      duration: { configurable: false, defaultDays: days, minDays: days, maxDays: days },
      speed: [...new Set(networks.map((network) => str(network.type).toUpperCase()).filter(Boolean))],
      tethering: null,
      activation: { billingStarts: null, preInstallDays: null },
      topup: reloadable
        ? {
            supported: true,
            type: "RoamWifi renewal",
            mode: "addon",
            stackTarget: null,
            window: "while_profile_exists",
            coverage: "same_area",
            profileRetentionDays: null,
          }
        : {
            supported: false, type: null, mode: "none", stackTarget: null, window: null,
            coverage: null, profileRetentionDays: null,
          },
      cost: { currency, amountMinor: cents(pkg.price), billingUnit: "plan" },
      bundles: [],
      extras: { voiceMinutes: 0, smsCount: 0, refundable: false, phoneNumberIncluded: false },
      additionalInfo: strOrNull(pkg.premark)?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null,
      available: true,
      providerUpdatedAt: null,
      raw: { sku, package: pkg },
    }];
  });
}

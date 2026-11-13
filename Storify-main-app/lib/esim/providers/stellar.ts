import { requestJson, sleep, type FetchLike } from "./http";
import {
  bool,
  countryCodes,
  int,
  iso2,
  num,
  obj,
  objArray,
  parseLpa,
  splitList,
  str,
  strOrNull,
} from "./json";
import {
  ProviderError,
  type CancelResult,
  type CoverageScope,
  type DataType,
  type EsimProviderAdapter,
  type EsimRef,
  type FulfillmentStatus,
  type JsonObject,
  type JsonValue,
  type LifecycleStatus,
  type ProfileStatus,
  type ProviderEsim,
  type ProviderPlan,
  type ProviderTopupPlan,
  type ProviderUsage,
  type PurchaseInput,
  type PurchaseResult,
  type TopupInput,
  type TopupResult,
  type TopupRule,
} from "./types";

/**
 * Stellar wholesale API (https://wholesale.stellarsecurity.com/api/v1).
 *
 * Ported from the live esim_php adapter. Stellar settles in EUR, prices in
 * cents, and addresses an eSIM by a 16-digit `sim_id`; an ICCID, when an
 * eSIM read carries one, is kept but never used to address it. Writes carry an `Idempotency-Key`, so a retried order
 * or top-up with the same key is answered with the original.
 */

const DEFAULT_BASE_URL = "https://wholesale.stellarsecurity.com/api/v1";
const PAGE_SIZE = 50;
/** A catalogue claiming more pages than this is treated as a broken response. */
const MAX_PAGES = 1000;
/** Stellar rate-limits catalogue reads (seen at ~60 pages in a minute). */
const RATE_LIMIT_RETRIES = 5;
const MAX_RETRY_WAIT_MS = 60_000;

export interface StellarOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: FetchLike;
  /** Injected so tests do not actually wait out a rate limit. */
  wait?: (ms: number) => Promise<void>;
}

export class StellarAdapter implements EsimProviderAdapter {
  readonly code = "stellar";
  readonly displayName = "Stellar";
  readonly capabilities = {
    listPlans: true,
    purchase: true,
    usage: true,
    topup: true,
    cancel: true,
    planLookup: true,
  } as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;
  private readonly wait: (ms: number) => Promise<void>;

  constructor(options: StellarOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) {
      throw new ProviderError("credentials_missing", "Stellar API key is required");
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
    this.wait = options.wait ?? sleep;
  }

  async probe() {
    const wallet = await this.call("GET", "/wallet");
    return {
      message: "Stellar credentials accepted",
      metadata: { currency: str(wallet.currency) || "EUR" } as JsonObject,
    };
  }

  /**
   * Walks every page and refuses a catalogue that changes under it: a page
   * count or total that moves mid-scan, or a repeated id, means the scan saw
   * an inconsistent catalogue and a sync built from it could wrongly retire
   * plans.
   */
  async *listPlans(): AsyncIterable<ProviderPlan> {
    const seen = new Set<string>();
    let lastPage: number | null = null;
    let total: number | null = null;

    for (let page = 1; lastPage === null || page <= lastPage; page += 1) {
      const response = await this.callRaw("GET", "/plans", { page, per_page: PAGE_SIZE });
      const rows = response.data;
      const meta = obj(response.meta);
      if (!Array.isArray(rows) || int(meta.current_page) !== page) {
        throw new ProviderError("invalid_response", "Stellar catalogue pagination is incomplete");
      }
      const metaLast = int(meta.last_page);
      if (metaLast === null || metaLast < page || metaLast > MAX_PAGES) {
        throw new ProviderError("invalid_response", "Stellar catalogue pagination is incomplete");
      }
      if (lastPage !== null && metaLast !== lastPage) {
        throw new ProviderError("invalid_response", "Stellar catalogue changed during the scan; retry");
      }
      lastPage = metaLast;
      const metaTotal = int(meta.total);
      if (metaTotal !== null) {
        if (total !== null && metaTotal !== total) {
          throw new ProviderError("invalid_response", "Stellar catalogue changed during the scan; retry");
        }
        total = metaTotal;
      }

      for (const row of objArray(rows)) {
        const id = str(row.id);
        if (!id || seen.has(id)) {
          throw new ProviderError("invalid_response", "Stellar catalogue has a missing or repeated plan id");
        }
        seen.add(id);
        yield mapPlan(row);
      }
    }

    if (total !== null && seen.size !== total) {
      throw new ProviderError("invalid_response", "Stellar catalogue changed during the scan; retry");
    }
  }

  async getPlan(providerPlanId: string) {
    try {
      return mapPlan(await this.call("GET", `/plans/${encodeURIComponent(providerPlanId)}`));
    } catch (error) {
      if (error instanceof ProviderError && error.code === "not_found") return null;
      throw error;
    }
  }

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const line: JsonObject = { plan_id: input.providerPlanId, quantity: 1 };
    if (input.durationDays !== null) line.days = input.durationDays;
    const order = await this.call("POST", "/orders", undefined, { plans: [line] }, input.idempotencyKey);
    const id = str(order.id);
    if (!id) throw new ProviderError("invalid_response", "Stellar order response has no id");
    // An accepted order is never reported as failed just because the status
    // read after it did not complete; the caller polls queryPurchase.
    try {
      return await this.queryPurchase(id);
    } catch (error) {
      if (error instanceof ProviderError && error.code !== "rejected") {
        return { status: "processing", providerOrderId: id, charged: null, esim: null, raw: order };
      }
      throw error;
    }
  }

  async queryPurchase(providerOrderId: string): Promise<PurchaseResult> {
    const order = await this.call("GET", `/orders/${encodeURIComponent(providerOrderId)}`);
    const status = str(order.status);
    const totalCents = money(order.total);
    const charged =
      totalCents !== null && str(order.currency).toUpperCase() === "EUR"
        ? { currency: "EUR", amountMinor: totalCents }
        : null;
    const base = { providerOrderId, charged, raw: order };

    if (status === "failed" || status === "refunded") return { ...base, status: "failed", esim: null };

    const cards = objArray(order.esims);
    if (cards.length !== 1 || str(cards[0].status) !== "fulfilled") {
      return { ...base, status: "processing", esim: null };
    }
    let card = cards[0];
    // Order listings may omit installation details; the eSIM read has them.
    if (!str(obj(card.installation).activation_code)) {
      card = await this.call("GET", `/esims/${validSimId(str(card.sim_id))}`);
    }
    const esim = mapEsim(card);
    if (!esim.installation.activationCode) {
      throw new ProviderError(
        "invalid_response",
        "Stellar returned no activation code; check the API key has esims:read",
      );
    }
    return { ...base, status: "fulfilled", esim };
  }

  async getEsim(ref: EsimRef) {
    return mapEsim(await this.call("GET", `/esims/${simIdOf(ref)}`));
  }

  async getUsage(ref: EsimRef): Promise<ProviderUsage> {
    const usage = await this.call("GET", `/esims/${simIdOf(ref)}/usage`);
    const data = obj(usage.data);
    const totalBytes = int(data.total_bytes);
    const usedBytes = int(data.used_bytes);
    const remainingBytes = int(data.remaining_bytes);
    if (
      totalBytes === null || usedBytes === null || remainingBytes === null ||
      totalBytes < 0 || usedBytes < 0 || remainingBytes < 0
    ) {
      throw new ProviderError("invalid_response", "Stellar usage snapshot is incomplete");
    }
    return {
      totalBytes,
      usedBytes,
      remainingBytes,
      lifecycleStatus: lifecycleStatus(obj(usage.lifecycle)),
      expiresAt: strOrNull(usage.expires_at),
      syncedAt: strOrNull(usage.synced_at),
      stale: bool(usage.stale),
      raw: usage,
    };
  }

  /**
   * `topupPlanId` is `<package_code>|<days>`: the same package can be offered
   * for several periods, and the pair is what `topup` must send back.
   */
  async listTopupPlans(ref: EsimRef): Promise<ProviderTopupPlan[]> {
    const rows = await this.callList("GET", `/esims/${simIdOf(ref)}/topup-plans`);
    return rows.map((row) => {
      const period = obj(row.period);
      const days = int(period.default) ?? int(row.validity_days) ?? 1;
      const price = obj(row.price);
      const cents = money(price.default_amount) ?? money(price.amount);
      if (cents === null || str(price.currency).toUpperCase() !== "EUR") {
        throw new ProviderError("invalid_response", "Stellar top-up plan has no EUR price");
      }
      return {
        topupPlanId: `${str(row.package_code)}|${days}`,
        name: str(row.name),
        megabytes: num(obj(row.data).megabytes) ?? 0,
        validityDays: days,
        cost: { currency: "EUR", amountMinor: cents },
        raw: row,
      };
    });
  }

  async topup(input: TopupInput): Promise<TopupResult> {
    const simId = simIdOf(input.esim);
    const [packageCode, daysText] = input.topupPlanId.split("|");
    const offered = (await this.callList("GET", `/esims/${simId}/topup-plans`)).find(
      (row) =>
        str(row.package_code) === packageCode &&
        String(int(obj(row.period).default) ?? int(row.validity_days) ?? 1) === daysText,
    );
    if (!offered) {
      throw new ProviderError("not_found", "Stellar no longer offers this top-up for the eSIM");
    }
    const payload: JsonObject = { package_code: packageCode };
    if (bool(obj(offered.period).required)) payload.period_num = Number(daysText);
    const topup = await this.call("POST", `/esims/${simId}/topups`, undefined, payload, input.idempotencyKey);
    const id = str(topup.id);
    if (!id) throw new ProviderError("invalid_response", "Stellar top-up response has no id");
    return { status: topupStatus(str(topup.status)), providerTopupId: id, raw: topup };
  }

  async queryTopup(providerTopupId: string): Promise<TopupResult> {
    const topup = await this.call("GET", `/topups/${encodeURIComponent(providerTopupId)}`);
    return { status: topupStatus(str(topup.status)), providerTopupId, raw: topup };
  }

  /** Confirmed only when Stellar says it both cancelled and refunded. */
  async cancel(ref: EsimRef): Promise<CancelResult> {
    const result = await this.call("POST", `/esims/${simIdOf(ref)}/cancel`);
    return {
      status:
        bool(result.provider_cancelled) === true && bool(result.refunded) === true
          ? "cancelled"
          : "unconfirmed",
      raw: result,
    };
  }

  private async call(
    method: "GET" | "POST",
    path: string,
    query?: Record<string, string | number>,
    body?: JsonObject,
    idempotencyKey?: string,
  ): Promise<JsonObject> {
    const response = await this.callRaw(method, path, query, body, idempotencyKey);
    if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
      throw new ProviderError("invalid_response", "Stellar response has no data object");
    }
    return obj(response.data);
  }

  private async callList(method: "GET", path: string): Promise<JsonObject[]> {
    const response = await this.callRaw(method, path);
    if (!Array.isArray(response.data)) {
      throw new ProviderError("invalid_response", "Stellar response has no data list");
    }
    return objArray(response.data);
  }

  private async callRaw(
    method: "GET" | "POST",
    path: string,
    query?: Record<string, string | number>,
    body?: JsonObject,
    idempotencyKey?: string,
  ): Promise<JsonObject> {
    for (let attempt = 0; ; attempt += 1) {
      const { status, ok, body: json, retryAfterMs } = await requestJson(this.fetcher, {
        method,
        url: `${this.baseUrl}${path}`,
        query,
        body: method === "POST" ? (body ?? {}) : undefined,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
      });
      // Reads back off and retry on a rate limit; writes are left to the
      // caller, who retries with the same idempotency key.
      if (status === 429 && method === "GET" && attempt < RATE_LIMIT_RETRIES) {
        await this.wait(Math.min(retryAfterMs ?? 2 ** attempt * 1000, MAX_RETRY_WAIT_MS));
        continue;
      }
      if (ok) return json;
      throw stellarError(method, path, status, json);
    }
  }
}

function stellarError(method: string, path: string, status: number, json: JsonObject) {
  const providerCode = str(obj(json.error).code);
  const safeCode = /^[a-z0-9_]+$/.test(providerCode) ? providerCode : null;
  return new ProviderError(
    status === 404 ? "not_found" : status >= 500 ? "uncertain" : "rejected",
    `Stellar ${method} ${path.split("/")[1]} failed with HTTP ${status}${safeCode ? ` (${safeCode})` : ""}`,
    status,
    safeCode,
  );
}

function validSimId(id: string): string {
  if (!/^[0-9]{16}$/.test(id)) {
    throw new ProviderError("invalid_response", "Stellar addresses eSIMs by a 16-digit sim_id");
  }
  return id;
}

function simIdOf(ref: EsimRef): string {
  return validSimId(ref.simId ?? "");
}

/** Decimal euros ("9.82") or integer cents → integer cents. */
function money(value: JsonValue | undefined): number | null {
  const amount = num(value);
  if (amount === null || amount < 0) return null;
  return Math.round(amount * 100);
}

function dataType(row: JsonObject, configurable: boolean): DataType {
  const type = str(obj(row.data).type).toLowerCase();
  if (configurable || type.includes("unlimited")) return "unlimited";
  return "total";
}

/** Stellar's topup.type wording → the platform's top-up rule. */
export function topupRule(topup: JsonObject, rechargeable: boolean | null): TopupRule {
  const type = strOrNull(topup.type);
  const text = (type ?? "").toLowerCase();
  const supported = (bool(topup.supported) ?? rechargeable ?? false) && !text.startsWith("non");
  if (!supported) {
    return {
      supported: false, type, mode: "none", stackTarget: null, window: null,
      coverage: null, profileRetentionDays: null,
    };
  }
  return {
    supported: true,
    type,
    mode: "stack",
    stackTarget: text.includes("days") ? "days" : "data",
    window: "before_expiry",
    coverage: text.includes("same area") ? "same_area" : null,
    profileRetentionDays: null,
  };
}

export function mapPlan(row: JsonObject): ProviderPlan {
  const id = str(row.id);
  const data = obj(row.data);
  const duration = obj(row.duration);
  const coverage = obj(row.coverage);
  const price = obj(row.price);
  const configurable = bool(duration.configurable) === true;
  const validityDays = int(row.validity_days) ?? int(duration.default_days) ?? 0;

  const countries = objArray(coverage.countries ?? row.supported_countries)
    .map((country) => ({ code: iso2(country.country_code), name: str(country.country) }))
    .filter((country): country is { code: string; name: string } => !!country.code);
  const codes = [
    ...new Set(
      (Array.isArray(coverage.codes) ? coverage.codes : [])
        .map((code) => iso2(code))
        .filter((code): code is string => !!code)
        .concat(countries.map((country) => country.code)),
    ),
  ];
  if (!codes.length && iso2(row.country_code)) codes.push(iso2(row.country_code)!);

  const destination = str(row.destination) || str(row.name);
  const scope: CoverageScope = /\bglobal\b/i.test(destination)
    ? "global"
    : codes.length > 1
      ? "regional"
      : "local";

  const centsField = int(price.amount_cents);
  const cents = centsField !== null && centsField >= 0 ? centsField : money(price.amount);
  if (cents === null || str(price.currency).toUpperCase() !== "EUR") {
    throw new ProviderError("invalid_response", `Stellar plan ${id} has no EUR price`);
  }

  const fairUse = obj(row.fair_use);
  const vpn = obj(row.vpn);
  const activation = obj(row.activation);
  const billingStarts = str(activation.billing_starts).toLowerCase();
  const megabytes = num(data.megabytes) ?? 0;

  return {
    providerPlanId: id,
    sku: strOrNull(row.sku),
    name: str(row.name),
    slug: str(row.slug) || id,
    productSlug: str(row.product_slug) || str(row.slug) || id,
    destination,
    emoji: strOrNull(row.emoji),
    coverage: {
      scope,
      countries: countries.length
        ? countries
        : codes.map((code) => ({ code, name: code })),
      networks: objArray(coverage.networks ?? row.supported_networks)
        .map((network) => ({
          countryCode: iso2(network.country_code) ?? "",
          operator: str(network.operator),
          network: strOrNull(network.network),
        }))
        .filter((network) => network.countryCode && network.operator),
      breakoutIp: countryCodes(splitList(coverage.breakout_ip_country_code)),
    },
    data: {
      megabytes,
      label: str(data.label),
      type: dataType(row, configurable),
    },
    fairUse: Object.keys(fairUse).length
      ? {
          highSpeedGbPerDay: num(fairUse.high_speed_data_gb_per_day),
          reducedSpeedMbps: num(fairUse.reduced_speed_mbps),
        }
      : null,
    validityDays,
    duration: {
      configurable,
      defaultDays: int(duration.default_days) ?? validityDays,
      minDays: int(duration.minimum_days) ?? validityDays,
      maxDays: int(duration.maximum_days) ?? validityDays,
    },
    speed: splitList(row.speed),
    tethering: bool(row.tethering_allowed),
    activation: {
      billingStarts: billingStarts.includes("installation")
        ? "first_installation"
        : billingStarts.includes("connection")
          ? "first_connection"
          : billingStarts.includes("purchase")
            ? "on_purchase"
            : null,
      preInstallDays: int(activation.pre_install_days),
    },
    topup: topupRule(obj(row.topup), bool(row.rechargeable)),
    cost: {
      currency: "EUR",
      amountMinor: cents,
      billingUnit: str(price.billing_unit) === "day" ? "day" : "plan",
    },
    bundles:
      bool(vpn.included) === true
        ? [{ type: "vpn", validityDays: int(vpn.validity_days) }]
        : [],
    extras: { voiceMinutes: 0, smsCount: 0, refundable: true, phoneNumberIncluded: false },
    additionalInfo: strOrNull(row.additional_info),
    available: bool(row.available) !== false,
    providerUpdatedAt: strOrNull(row.updated_at),
    raw: row,
  };
}

function lifecycleStatus(lifecycle: JsonObject): LifecycleStatus | null {
  switch (str(lifecycle.status)) {
    case "in_use":
    case "active":
      return "in_use";
    case "depleted":
      return "depleted";
    case "installed":
      return "installed";
    case "expired":
      return "expired";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "not_installed":
    case "new":
      return "not_installed";
    default:
      return bool(lifecycle.installed) === true ? "installed" : null;
  }
}

function profileStatus(value: string): ProfileStatus | null {
  const known: ProfileStatus[] = ["released", "installed", "enabled", "disabled", "deleted"];
  if (!value) return null;
  return (known as string[]).includes(value) ? (value as ProfileStatus) : "unknown";
}

function fulfillmentStatus(value: string): FulfillmentStatus {
  const known: FulfillmentStatus[] = ["pending", "processing", "fulfilled", "failed", "cancelled", "refunded"];
  return (known as string[]).includes(value) ? (value as FulfillmentStatus) : "processing";
}

function topupStatus(value: string): TopupResult["status"] {
  if (["completed", "fulfilled", "succeeded"].includes(value)) return "completed";
  if (["failed", "refunded", "cancelled", "canceled"].includes(value)) return "failed";
  return "processing";
}

/**
 * A real ICCID: "89" (telecom), 18–22 digits in all, maybe a trailing F
 * filler. Only a string: a JSON number that long has already lost digits.
 */
export function normalizeIccid(value: JsonValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\s-]/g, "").toUpperCase();
  return /^89\d{16,20}F?$/.test(text) ? text : null;
}

/**
 * The ICCID on a Stellar eSIM or usage read, when it carries one. Stellar
 * names eSIMs by `sim_id` and long gave no ICCID, so it is read wherever it
 * turns up (top level, or under `sim` / `installation` / `lifecycle` /
 * `profile`) and only when it is a well-formed ICCID; a sim_id is never one.
 * Two different ICCIDs on one card are not trusted: null.
 */
export function stellarIccid(card: JsonObject): string | null {
  const found = new Set<string>();
  for (const node of [card, obj(card.sim), obj(card.installation), obj(card.lifecycle), obj(card.profile)]) {
    for (const key of ["iccid", "ICCID", "sim_iccid"]) {
      const iccid = normalizeIccid(node[key]);
      if (iccid) found.add(iccid);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

export function mapEsim(card: JsonObject): ProviderEsim {
  const lifecycle = obj(card.lifecycle);
  const installation = obj(card.installation);
  const vpn = obj(card.vpn);
  const activationCode = strOrNull(installation.activation_code);
  const simId = str(card.sim_id);
  return {
    providerEsimId: strOrNull(card.id),
    simId: simId || null,
    iccid: stellarIccid(card),
    status: fulfillmentStatus(str(card.status)),
    usageAvailable: bool(card.usage_available) === true,
    lifecycle: {
      status: lifecycleStatus(lifecycle),
      profileStatus: profileStatus(str(lifecycle.profile_status)),
      installed: bool(lifecycle.installed),
      installationDetectedAt: strOrNull(lifecycle.installation_detected_at),
      activationDetectedAt: strOrNull(lifecycle.activation_detected_at),
    },
    installation: {
      activationCode,
      ...parseLpa(activationCode),
      qrCodeUrl: strOrNull(installation.qr_code_url),
      apn: strOrNull(installation.apn),
    },
    customerLink: strOrNull(card.customer_link),
    bundles:
      bool(vpn.included) === true
        ? [{
            type: "vpn",
            status: strOrNull(vpn.status),
            ready: bool(vpn.ready),
            accountNumber: strOrNull(vpn.account_number),
            validityDays: int(vpn.validity_days),
            expiresAt: strOrNull(vpn.expires_at),
          }]
        : [],
    fulfilledAt: strOrNull(card.fulfilled_at),
    expiresAt: strOrNull(card.expires_at),
    raw: card,
  };
}

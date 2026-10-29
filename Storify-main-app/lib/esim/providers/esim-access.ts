import { requestJson, type FetchLike } from "./http";
import {
  bool,
  countryCodes,
  currency,
  int,
  iso2,
  num,
  obj,
  objArray,
  parseLpa,
  slugify,
  str,
  strOrNull,
  megabytesLabel,
} from "./json";
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
  type ProfileStatus,
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
 * eSIM Access open API (https://api.esimaccess.com/api/v1/open).
 *
 * Ported from the eSIM-Platform adapter onto the Stellar-shaped contract.
 * Every call is a POST authenticated by the `RT-AccessCode` header; money is
 * in units of 1/10000 USD; an order returns an order number and the profile
 * is allocated asynchronously (error 200010 = "not allocated yet").
 *
 * The provider's own `transactionId` is its idempotency key: re-sending an
 * order with the same id does not buy a second eSIM.
 */

const DEFAULT_BASE_URL = "https://api.esimaccess.com/api/v1/open";
const PROFILE_PENDING_ERROR = "200010";
const BYTES_PER_MB = 1024 * 1024;
// "_Daily" packages (e.g. "JP_1_Daily") are sold as fixed one-day plans, as
// the live esim_php system does — not as a chosen number of days (decided
// 2026-10-25).

export interface EsimAccessOptions {
  accessCode: string;
  baseUrl?: string;
  fetch?: FetchLike;
}

export class EsimAccessAdapter implements EsimProviderAdapter {
  readonly code = "esimaccess";
  readonly displayName = "eSIM Access";
  readonly capabilities = {
    listPlans: true,
    purchase: true,
    usage: true,
    topup: true,
    // The API refunds only unused profiles and only on request to support.
    cancel: false,
    planLookup: true,
  } as const;

  private readonly accessCode: string;
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(options: EsimAccessOptions) {
    this.accessCode = options.accessCode.trim();
    if (!this.accessCode) {
      throw new ProviderError("credentials_missing", "eSIM Access access code is required");
    }
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
  }

  async probe() {
    const locations = await this.locationNames();
    return {
      message: "eSIM Access credentials accepted",
      metadata: { locations: locations.size } as JsonObject,
    };
  }

  async *listPlans(): AsyncIterable<ProviderPlan> {
    const names = await this.locationNames();
    for (const row of await this.packages({ type: "BASE" })) {
      yield mapPlan(row, names);
    }
  }

  async getPlan(providerPlanId: string) {
    const row = (await this.packages({ packageCode: providerPlanId })).find(
      (candidate) => str(candidate.packageCode) === providerPlanId,
    );
    return row ? mapPlan(row, await this.locationNames()) : null;
  }

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    const result = await this.call("/esim/order", {
      transactionId: transactionId(input.idempotencyKey),
      packageInfoList: [{ packageCode: input.providerPlanId, count: 1 }],
    });
    const orderNo = str(result.orderNo);
    if (!orderNo) throw new ProviderError("invalid_response", "eSIM Access order returned no order number");
    try {
      return await this.queryPurchase(orderNo);
    } catch (error) {
      if (error instanceof ProviderError && error.code !== "rejected") {
        return { status: "processing", providerOrderId: orderNo, charged: null, esim: null, raw: result };
      }
      throw error;
    }
  }

  async queryPurchase(providerOrderId: string): Promise<PurchaseResult> {
    const profiles = await this.queryProfiles({ orderNo: providerOrderId });
    const profile =
      profiles.find((candidate) => str(candidate.orderNo) === providerOrderId) ?? profiles[0];
    if (!profile) {
      return { status: "processing", providerOrderId, charged: null, esim: null, raw: { orderNo: providerOrderId } };
    }
    return {
      status: "fulfilled",
      providerOrderId,
      charged: null,
      esim: mapProfile(profile),
      raw: profile,
    };
  }

  async getEsim(ref: EsimRef) {
    const profiles = await this.queryProfiles(
      ref.iccid ? { iccid: ref.iccid } : { esimTranNo: ref.providerEsimId ?? "" },
    );
    if (!profiles[0]) throw new ProviderError("not_found", "eSIM Access profile not found");
    return mapProfile(profiles[0]);
  }

  async getUsage(ref: EsimRef): Promise<ProviderUsage> {
    const esimTranNo = ref.providerEsimId?.trim();
    if (!esimTranNo) throw new ProviderError("not_found", "eSIM Access needs the esimTranNo");
    const result = await this.call("/esim/usage/query", { esimTranNoList: [esimTranNo] });
    const usage = objArray(result.esimUsageList)[0];
    if (!usage) throw new ProviderError("not_found", "eSIM Access returned no usage for the eSIM");
    const totalBytes = int(usage.totalData) ?? 0;
    const usedBytes = int(usage.dataUsage) ?? 0;
    return {
      totalBytes,
      usedBytes,
      remainingBytes: Math.max(totalBytes - usedBytes, 0),
      lifecycleStatus: totalBytes > 0 && usedBytes >= totalBytes ? "depleted" : null,
      expiresAt: strOrNull(usage.expiredTime) ?? strOrNull(usage.expireDate),
      syncedAt: strOrNull(usage.lastUpdateTime),
      stale: null,
      raw: usage,
    };
  }

  async listTopupPlans(ref: EsimRef): Promise<ProviderTopupPlan[]> {
    if (!ref.iccid) throw new ProviderError("not_found", "eSIM Access lists top-ups by ICCID");
    return (await this.packages({ type: "TOPUP", iccid: ref.iccid })).map((row) => ({
      topupPlanId: str(row.packageCode),
      name: str(row.name),
      megabytes: Math.round((int(row.volume) ?? 0) / BYTES_PER_MB),
      validityDays: validityDays(row),
      cost: { currency: currency(row.currencyCode, "USD"), amountMinor: cents(row.price) },
      raw: row,
    }));
  }

  async topup(input: TopupInput): Promise<TopupResult> {
    const result = await this.call("/esim/topup", {
      esimTranNo: input.esim.providerEsimId ?? "",
      iccid: input.esim.iccid ?? "",
      packageCode: input.topupPlanId,
      transactionId: transactionId(input.idempotencyKey),
    });
    return {
      status: "completed",
      providerTopupId: str(result.topUpEsimTranNo) || str(result.orderNo) || transactionId(input.idempotencyKey),
      raw: result,
    };
  }

  async cancel(): Promise<CancelResult> {
    return { status: "not_supported", raw: {} };
  }

  private async locationNames(): Promise<Map<string, string>> {
    const result = await this.call("/location/list", { type: "" });
    const names = new Map<string, string>();
    for (const location of objArray(result.locationList)) {
      const code = str(location.code).toUpperCase();
      if (code) names.set(code, str(location.name) || code);
    }
    return names;
  }

  private async packages(filter: { type?: string; packageCode?: string; iccid?: string }) {
    const result = await this.call("/package/list", {
      locationCode: "",
      type: filter.type ?? "",
      slug: "",
      packageCode: filter.packageCode ?? "",
      iccid: filter.iccid ?? "",
    });
    return objArray(result.packageList);
  }

  private async queryProfiles(filter: { orderNo?: string; iccid?: string; esimTranNo?: string }) {
    const { body } = await this.post("/esim/query", {
      orderNo: filter.orderNo ?? "",
      iccid: filter.iccid ?? "",
      esimTranNo: filter.esimTranNo ?? "",
      pager: { pageNum: 1, pageSize: 50 },
    });
    if (bool(body.success)) return objArray(obj(body.obj).esimList);
    if (str(body.errorCode) === PROFILE_PENDING_ERROR) return [];
    throw rejection(body);
  }

  private async call(path: string, payload: JsonObject): Promise<JsonObject> {
    const { body } = await this.post(path, payload);
    if (!bool(body.success)) throw rejection(body);
    return obj(body.obj);
  }

  private async post(path: string, payload: JsonObject) {
    const response = await requestJson(this.fetcher, {
      method: "POST",
      url: `${this.baseUrl}${path}`,
      headers: { "RT-AccessCode": this.accessCode },
      body: payload,
    });
    if (!response.ok) {
      throw new ProviderError(
        response.status >= 500 ? "uncertain" : "rejected",
        `eSIM Access ${path} failed with HTTP ${response.status}`,
        response.status,
      );
    }
    return response;
  }
}

function rejection(body: JsonObject) {
  const code = strOrNull(body.errorCode);
  return new ProviderError(
    "rejected",
    `eSIM Access refused the request${code ? ` (${code})` : ""}: ${str(body.errorMsg) || "no reason given"}`,
    null,
    code,
  );
}

/** The provider caps transactionId at 50 characters of [A-Za-z0-9_]. */
function transactionId(idempotencyKey: string) {
  return idempotencyKey.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 50) || "manual";
}

/** 1/10000 USD → cents. */
function cents(value: JsonValue | undefined) {
  const amount = num(value);
  return amount && amount > 0 ? Math.round(amount / 100) : 0;
}

function validityDays(row: JsonObject) {
  const duration = num(row.duration) ?? 0;
  const unit = str(row.durationUnit).toLowerCase();
  if (!duration) return 0;
  if (unit.startsWith("hour")) return Math.max(Math.ceil(duration / 24), 1);
  if (unit.startsWith("month")) return Math.trunc(duration * 30);
  if (unit.startsWith("year")) return Math.trunc(duration * 365);
  return Math.trunc(duration);
}

/**
 * dataType: 1 total, 2 daily limit then reduced speed, 3 daily limit then cut
 * off, 4 daily unlimited, 5 lifetime. A "reduced" speed under 512 kbps is
 * unusable in practice and is treated as a cut-off.
 */
function dataType(row: JsonObject): DataType {
  switch (int(row.dataType)) {
    case 2: {
      const fup = str(row.fupPolicy).toLowerCase();
      const speed = num(fup);
      const kbps = speed === null ? null : /mbps|mbit|mb\/s/.test(fup) ? speed * 1000 : speed;
      return kbps !== null && kbps < 512 ? "daily_cutoff" : "daily_throttled";
    }
    case 3:
      return "daily_cutoff";
    case 4:
      return "unlimited";
    case 5:
      return "lifetime";
    default:
      return "total";
  }
}

/** fupPolicy as "384 Kbps" / "1Mbps" → Mbps, or null. */
function speedMbps(text: string): number | null {
  const amount = num(text);
  if (amount === null) return null;
  const lower = text.toLowerCase();
  if (/kbps|kbit|kb\/s/.test(lower)) return amount / 1000;
  if (/mbps|mbit|mb\/s/.test(lower)) return amount;
  return null;
}

/**
 * Daily plans: the volume is the daily high-speed allowance and fupPolicy the
 * speed after it — Stellar's fair_use shape. A cut-off plan has no
 * after-speed worth stating.
 */
function fairUse(row: JsonObject, megabytes: number): ProviderPlan["fairUse"] {
  const type = dataType(row);
  if (type !== "daily_throttled" && type !== "daily_cutoff") return null;
  return {
    highSpeedGbPerDay: megabytes ? Math.round((megabytes / 1024) * 100) / 100 : null,
    reducedSpeedMbps: type === "daily_cutoff" ? 0 : speedMbps(str(row.fupPolicy)),
  };
}

function coverageOf(row: JsonObject, names: Map<string, string>) {
  const networks: ProviderPlan["coverage"]["networks"] = [];
  const codes = new Set<string>();
  for (const location of objArray(row.locationNetworkList)) {
    const code = iso2(location.locationCode);
    if (!code) continue;
    codes.add(code);
    for (const operator of objArray(location.operatorList)) {
      const name = str(operator.operatorName);
      if (name) networks.push({ countryCode: code, operator: name, network: strOrNull(operator.networkType) });
    }
  }
  if (!codes.size) {
    for (const part of str(row.location).split(",")) {
      const code = iso2(part);
      if (code) codes.add(code);
    }
  }
  const slug = str(row.slug).toUpperCase();
  const scope: CoverageScope =
    slug.startsWith("GL-") || slug.startsWith("GLOBAL") ? "global" : codes.size > 1 ? "regional" : "local";
  return {
    scope,
    countries: [...codes].map((code) => ({ code, name: names.get(code) ?? code })),
    networks,
  };
}

export function mapPlan(row: JsonObject, names: Map<string, string>): ProviderPlan {
  const id = str(row.packageCode);
  const coverage = coverageOf(row, names);
  const days = validityDays(row);
  const bytes = int(row.volume) ?? 0;
  const megabytes = Math.round(bytes / BYTES_PER_MB);
  const regionCode = str(row.slug).split("_", 1)[0];
  const destination =
    coverage.scope === "local"
      ? coverage.countries[0]?.name ?? str(row.name)
      : coverage.scope === "global"
        ? "Global"
        : names.get(regionCode.toUpperCase()) ?? str(row.name);
  const reloadable = [2, 3].includes(int(row.supportTopUpType) ?? 0);
  const smsCount = int(row.smsStatus) === 1 ? (int(row.smsCount) ?? 0) : 0;
  const activeType = int(row.activeType);

  return {
    providerPlanId: id,
    sku: id || null,
    name: str(row.name) || id,
    slug: str(row.slug) || id,
    productSlug: coverage.scope === "global" ? "global-esim" : `${slugify(destination)}-esim`,
    destination,
    emoji: null,
    coverage: {
      ...coverage,
      breakoutIp: countryCodes(str(row.ipExport).split(/[\/,\s]+/)),
    },
    data: { megabytes, label: megabytesLabel(megabytes), type: dataType(row) },
    fairUse: fairUse(row, megabytes),
    validityDays: days,
    duration: { configurable: false, defaultDays: days, minDays: days, maxDays: days },
    speed: [...new Set(objArray(row.locationNetworkList).flatMap((location) =>
      objArray(location.operatorList).map((operator) => str(operator.networkType)).filter(Boolean),
    ))],
    tethering: null,
    activation: {
      billingStarts: activeType === 1 ? "first_installation" : activeType === 2 ? "first_connection" : null,
      preInstallDays: int(row.unusedValidTime),
    },
    topup: reloadable
      ? {
          supported: true,
          type: "eSIM Access reload",
          mode: "stack",
          stackTarget: "data_and_days",
          window: "before_expiry",
          coverage: "same_area",
          profileRetentionDays: null,
        }
      : {
          supported: false, type: null, mode: "none", stackTarget: null, window: null,
          coverage: null, profileRetentionDays: null,
        },
    cost: { currency: currency(row.currencyCode, "USD"), amountMinor: cents(row.price), billingUnit: "plan" },
    bundles: [],
    extras: { voiceMinutes: 0, smsCount, refundable: false, phoneNumberIncluded: false },
    // `description` only repeats the plan name; the speed policy is the useful note.
    additionalInfo: strOrNull(row.fupPolicy),
    available: true,
    providerUpdatedAt: null,
    raw: row,
  };
}

/** esimStatus is the order side, smdpStatus the handset side. */
function lifecycleOf(esimStatus: string, smdpStatus: string): {
  status: LifecycleStatus | null;
  profileStatus: ProfileStatus | null;
} {
  const esim = esimStatus.toUpperCase();
  const smdp = smdpStatus.toUpperCase();
  const profileStatus: ProfileStatus | null =
    smdp === "RELEASED" ? "released"
      : smdp === "INSTALLATION" || smdp === "INSTALLED" ? "installed"
        : smdp === "ENABLED" ? "enabled"
          : smdp === "DISABLED" ? "disabled"
            : smdp === "DELETED" ? "deleted"
              : smdp ? "unknown" : null;
  const status: LifecycleStatus | null =
    esim === "USED_UP" ? "depleted"
      : esim === "USED_EXPIRED" || esim === "UNUSED_EXPIRED" ? "expired"
        : esim === "CANCEL" || esim === "REVOKED" ? "cancelled"
          : esim === "IN_USE" ? "in_use"
            : profileStatus === "installed" || profileStatus === "enabled" ? "installed"
              : esim === "GOT_RESOURCE" ? "not_installed"
                : null;
  return { status, profileStatus };
}

export function mapProfile(profile: JsonObject): ProviderEsim {
  const activationCode = strOrNull(profile.ac) ?? strOrNull(profile.activationCode);
  const lpa = parseLpa(activationCode);
  const { status, profileStatus } = lifecycleOf(str(profile.esimStatus), str(profile.smdpStatus));
  return {
    providerEsimId: strOrNull(profile.esimTranNo),
    simId: null,
    iccid: strOrNull(profile.iccid),
    status: "fulfilled",
    usageAvailable: true,
    lifecycle: {
      status,
      profileStatus,
      installed: profileStatus ? profileStatus !== "released" : null,
      installationDetectedAt: null,
      activationDetectedAt: strOrNull(profile.activateTime),
    },
    installation: {
      activationCode,
      smdpAddress: strOrNull(profile.smdpAddress) ?? lpa.smdpAddress,
      matchingId: strOrNull(profile.matchingId) ?? lpa.matchingId,
      qrCodeUrl: strOrNull(profile.qrCodeUrl),
      apn: strOrNull(profile.apn),
    },
    customerLink: strOrNull(profile.shortUrl),
    bundles: [],
    fulfilledAt: strOrNull(profile.createTime),
    expiresAt: strOrNull(profile.expiredTime),
    raw: profile,
  };
}

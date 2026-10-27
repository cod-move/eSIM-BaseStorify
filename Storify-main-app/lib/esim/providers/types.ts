/**
 * The contract every eSIM provider adapter implements.
 *
 * Shapes follow Stellar's wholesale API (plans, eSIMs, usage), which the
 * reviewed spec adopted as the platform's own model; other providers map onto
 * it inside their adapter. Adapters only call the provider and normalize —
 * they never touch the database, orders or the ledger, and never return
 * credentials. Every normalized object keeps the provider's original payload
 * in `raw` for audit and troubleshooting.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type CoverageScope = "local" | "regional" | "global";

/** total: a fixed allowance; the daily kinds reset every day. */
export type DataType =
  | "total"
  | "unlimited"
  | "daily_throttled"
  | "daily_cutoff"
  | "lifetime";

export type BillingStart = "first_connection" | "first_installation" | "on_purchase";

/**
 * stack: added onto the current plan (validity stacks);
 * addon: a separate package with its own allowance and validity.
 */
export type TopupMode = "stack" | "addon" | "none";
export type TopupStackTarget = "data" | "days" | "data_and_days";
/**
 * before_expiry: must be bought before the current plan expires, after which
 * the eSIM is void; while_profile_exists: any time, the profile stays valid.
 */
export type TopupWindow = "before_expiry" | "while_profile_exists";

export interface TopupRule {
  supported: boolean;
  /** The provider's own wording, kept for display and audit. */
  type: string | null;
  mode: TopupMode;
  stackTarget: TopupStackTarget | null;
  window: TopupWindow | null;
  coverage: "same_area" | "any_area" | null;
  /** addon only: days without a live package before the provider reclaims the profile. */
  profileRetentionDays: number | null;
}

export interface Money {
  currency: string;
  /** Integer minor units (cents). */
  amountMinor: number;
}

export interface ProviderPlan {
  providerPlanId: string;
  sku: string | null;
  name: string;
  slug: string;
  /** Plans sharing it become variants of one storefront product. */
  productSlug: string;
  destination: string;
  emoji: string | null;
  coverage: {
    scope: CoverageScope;
    countries: Array<{ code: string; name: string }>;
    networks: Array<{ countryCode: string; operator: string; network: string | null }>;
    /** Countries the traffic breaks out in (landing IP). */
    breakoutIp: string[];
  };
  data: { megabytes: number; label: string; type: DataType };
  fairUse: { highSpeedGbPerDay: number | null; reducedSpeedMbps: number | null } | null;
  validityDays: number;
  /** configurable: the buyer picks the number of days, priced per day. */
  duration: { configurable: boolean; defaultDays: number; minDays: number; maxDays: number };
  speed: string[];
  tethering: boolean | null;
  activation: { billingStarts: BillingStart | null; preInstallDays: number | null };
  topup: TopupRule;
  cost: Money & { billingUnit: "plan" | "day" };
  bundles: Array<{ type: "vpn"; validityDays: number | null }>;
  /** Fields Stellar lacks but other providers carry. */
  extras: {
    voiceMinutes: number;
    smsCount: number;
    refundable: boolean;
    phoneNumberIncluded: boolean;
  };
  additionalInfo: string | null;
  available: boolean;
  providerUpdatedAt: string | null;
  raw: JsonObject;
}

export type FulfillmentStatus =
  | "pending"
  | "processing"
  | "fulfilled"
  | "failed"
  | "cancelled"
  | "refunded";

export type LifecycleStatus =
  | "not_installed"
  | "installed"
  | "in_use"
  | "depleted"
  | "expired"
  | "cancelled";

export type ProfileStatus =
  | "released"
  | "installed"
  | "enabled"
  | "disabled"
  | "deleted"
  | "unknown";

/** How an existing eSIM is addressed; providers key on different ids. */
export interface EsimRef {
  providerEsimId: string | null;
  simId: string | null;
  iccid: string | null;
}

export interface ProviderEsim extends EsimRef {
  status: FulfillmentStatus;
  usageAvailable: boolean;
  lifecycle: {
    status: LifecycleStatus | null;
    profileStatus: ProfileStatus | null;
    installed: boolean | null;
    installationDetectedAt: string | null;
    activationDetectedAt: string | null;
  };
  installation: {
    activationCode: string | null;
    smdpAddress: string | null;
    matchingId: string | null;
    qrCodeUrl: string | null;
    apn: string | null;
  };
  customerLink: string | null;
  bundles: Array<{
    type: "vpn";
    status: string | null;
    ready: boolean | null;
    accountNumber: string | null;
    validityDays: number | null;
    expiresAt: string | null;
  }>;
  fulfilledAt: string | null;
  expiresAt: string | null;
  raw: JsonObject;
}

export interface PurchaseInput {
  providerPlanId: string;
  /** Only for duration-configurable plans. */
  durationDays: number | null;
  /** Stable per order line + unit; a retry with the same key must not buy twice. */
  idempotencyKey: string;
}

export interface PurchaseResult {
  /** fulfilled: `esim` is set; processing: poll queryPurchase later. */
  status: "fulfilled" | "processing" | "failed";
  providerOrderId: string;
  /** Wholesale amount actually charged, when the provider reports it. */
  charged: Money | null;
  esim: ProviderEsim | null;
  raw: JsonObject;
}

export interface ProviderUsage {
  totalBytes: number;
  usedBytes: number;
  remainingBytes: number;
  lifecycleStatus: LifecycleStatus | null;
  expiresAt: string | null;
  syncedAt: string | null;
  /** The provider's own snapshot may lag; it says so. */
  stale: boolean | null;
  raw: JsonObject;
}

export interface ProviderTopupPlan {
  /** Opaque id the adapter accepts back in `topup`. */
  topupPlanId: string;
  name: string;
  megabytes: number;
  validityDays: number;
  cost: Money;
  raw: JsonObject;
}

export interface TopupInput {
  esim: EsimRef;
  topupPlanId: string;
  idempotencyKey: string;
}

export interface TopupResult {
  status: "completed" | "processing" | "failed";
  providerTopupId: string;
  raw: JsonObject;
}

export interface CancelResult {
  status: "cancelled" | "not_supported" | "unconfirmed";
  raw: JsonObject;
}

export type ProviderCapability =
  | "listPlans"
  | "purchase"
  | "usage"
  | "topup"
  | "cancel";

export interface EsimProviderAdapter {
  readonly code: string;
  readonly displayName: string;
  readonly capabilities: Readonly<Record<ProviderCapability, boolean>>;
  /**
   * Calls the supplier gives no idempotency key for: an uncertain answer to
   * one cannot be retried safely, so the caller stops and asks a person.
   */
  readonly nonIdempotent?: Readonly<{ topup?: boolean }>;
  /** Cheap authenticated call proving the credentials work. */
  probe(): Promise<{ message: string; metadata: JsonObject }>;
  /** The full catalogue, streamed so a large one never sits in memory whole. */
  listPlans(): AsyncIterable<ProviderPlan>;
  /** One plan's live state; null when the provider no longer has it. */
  getPlan(providerPlanId: string): Promise<ProviderPlan | null>;
  purchase(input: PurchaseInput): Promise<PurchaseResult>;
  queryPurchase(providerOrderId: string): Promise<PurchaseResult>;
  getEsim(ref: EsimRef): Promise<ProviderEsim>;
  getUsage(ref: EsimRef): Promise<ProviderUsage>;
  listTopupPlans(ref: EsimRef): Promise<ProviderTopupPlan[]>;
  topup(input: TopupInput): Promise<TopupResult>;
  /** A top-up that answered "processing", read again; suppliers without it are asked by repeating `topup` with the same key. */
  queryTopup?(providerTopupId: string): Promise<TopupResult>;
  cancel(ref: EsimRef): Promise<CancelResult>;
}

export type ProviderErrorCode =
  | "credentials_missing"
  | "not_found"
  | "unsupported"
  | "invalid_response"
  /** The request may or may not have reached the provider; never retry blindly. */
  | "uncertain"
  | "rejected";

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly httpStatus: number | null = null,
    readonly providerCode: string | null = null,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

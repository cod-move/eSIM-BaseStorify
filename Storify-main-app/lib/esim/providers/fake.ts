import { createHash } from "node:crypto";
import {
  ProviderError,
  type CancelResult,
  type EsimProviderAdapter,
  type EsimRef,
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
 * A supplier that sells nothing real, for exercising fulfilment end to end
 * without spending a supplier balance. Registered only when
 * ESIM_ENABLE_FAKE_PROVIDER=true (see registry.ts) — never in production.
 *
 * `mode` picks the behaviour: fulfil (instant), pending (processing first,
 * delivered on the next query), reject (refuses), uncertain (times out) —
 * for purchases and top-ups alike.
 * The same idempotency key always yields the same eSIM, like a real supplier.
 */

export type FakeMode = "fulfil" | "pending" | "reject" | "uncertain";

export interface FakeOptions {
  mode: FakeMode;
}

function digits(seed: string, length: number) {
  const hex = createHash("sha256").update(seed).digest("hex");
  return BigInt(`0x${hex}`).toString().slice(0, length).padEnd(length, "0");
}

function fakeEsim(key: string): ProviderEsim {
  const matchingId = createHash("sha256").update(`m:${key}`).digest("hex").slice(0, 24).toUpperCase();
  const activationCode = `LPA:1$rsp.fake.invalid$${matchingId}`;
  return {
    providerEsimId: `fake-${digits(key, 10)}`,
    simId: digits(`s:${key}`, 16),
    iccid: `8999${digits(`i:${key}`, 15)}`,
    status: "fulfilled",
    usageAvailable: true,
    lifecycle: {
      status: "not_installed",
      profileStatus: "released",
      installed: false,
      installationDetectedAt: null,
      activationDetectedAt: null,
    },
    installation: {
      activationCode,
      smdpAddress: "rsp.fake.invalid",
      matchingId,
      qrCodeUrl: null,
      apn: "fake.apn",
    },
    customerLink: null,
    bundles: [],
    fulfilledAt: new Date().toISOString(),
    expiresAt: null,
    raw: { fake: true },
  };
}

export class FakeAdapter implements EsimProviderAdapter {
  readonly code = "fake";
  readonly displayName = "Fake supplier (testing)";
  readonly capabilities = { listPlans: true, purchase: true, usage: true, topup: true, cancel: true } as const;

  constructor(private readonly options: FakeOptions) {}

  async probe() {
    return { message: `Fake supplier in ${this.options.mode} mode`, metadata: { mode: this.options.mode } };
  }

  async *listPlans(): AsyncIterable<ProviderPlan> {
    // The fake sells only plans created by hand in tests.
  }

  async getPlan() {
    return null;
  }

  async purchase(input: PurchaseInput): Promise<PurchaseResult> {
    switch (this.options.mode) {
      case "reject":
        throw new ProviderError("rejected", "Fake supplier refuses every order");
      case "uncertain":
        throw new ProviderError("uncertain", "Fake supplier timed out");
      case "pending":
        return { status: "processing", providerOrderId: `fo-${input.idempotencyKey}`, charged: null, esim: null, raw: { fake: true } };
      default:
        return {
          status: "fulfilled",
          providerOrderId: `fo-${input.idempotencyKey}`,
          charged: { currency: "USD", amountMinor: 100 },
          esim: fakeEsim(input.idempotencyKey),
          raw: { fake: true },
        };
    }
  }

  async queryPurchase(providerOrderId: string): Promise<PurchaseResult> {
    const key = providerOrderId.replace(/^fo-/, "");
    return { status: "fulfilled", providerOrderId, charged: null, esim: fakeEsim(key), raw: { fake: true } };
  }

  async getEsim(ref: EsimRef) {
    const esim = fakeEsim(ref.providerEsimId ?? ref.iccid ?? "unknown");
    // Looked up by ICCID (an admin binding a hand-bought eSIM): that eSIM.
    return ref.iccid && !ref.providerEsimId ? { ...esim, iccid: ref.iccid } : esim;
  }

  async getUsage(): Promise<ProviderUsage> {
    return { totalBytes: 0, usedBytes: 0, remainingBytes: 0, lifecycleStatus: "not_installed", expiresAt: null, syncedAt: null, stale: null, raw: {} };
  }

  /** Two top-ups for any eSIM: 1 GB / 7 days and 3 GB / 30 days, priced in EUR like Stellar. */
  async listTopupPlans(): Promise<ProviderTopupPlan[]> {
    return [
      { topupPlanId: "fake-topup-1gb", name: "Top-up 1GB 7Days", megabytes: 1024, validityDays: 7, cost: { currency: "EUR", amountMinor: 150 }, raw: { fake: true } },
      { topupPlanId: "fake-topup-3gb", name: "Top-up 3GB 30Days", megabytes: 3072, validityDays: 30, cost: { currency: "EUR", amountMinor: 400 }, raw: { fake: true } },
    ];
  }

  async topup(input: TopupInput): Promise<TopupResult> {
    if (!(await this.listTopupPlans()).some((plan) => plan.topupPlanId === input.topupPlanId)) {
      throw new ProviderError("not_found", "Fake supplier has no such top-up");
    }
    switch (this.options.mode) {
      case "reject":
        throw new ProviderError("rejected", "Fake supplier refuses every top-up");
      case "uncertain":
        throw new ProviderError("uncertain", "Fake supplier timed out");
      case "pending":
        return { status: "processing", providerTopupId: `ft-${input.idempotencyKey}`, raw: { fake: true } };
      default:
        return { status: "completed", providerTopupId: `ft-${input.idempotencyKey}`, raw: { fake: true } };
    }
  }

  async queryTopup(providerTopupId: string): Promise<TopupResult> {
    return { status: "completed", providerTopupId, raw: { fake: true } };
  }

  async cancel(): Promise<CancelResult> {
    return { status: "cancelled", raw: { fake: true } };
  }
}

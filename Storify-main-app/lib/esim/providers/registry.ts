import { BnesimAdapter } from "./bnesim";
import { EsimAccessAdapter } from "./esim-access";
import { FakeAdapter, type FakeMode } from "./fake";
import { MobiMatterAdapter } from "./mobimatter";
import { RoamWifiAdapter } from "./roamwifi";
import { StellarAdapter } from "./stellar";
import { ProviderError, type EsimProviderAdapter } from "./types";

/**
 * Provider code → adapter. Adding a provider is one entry here plus its
 * adapter file; nothing outside lib/esim changes.
 *
 * `credentials` is the decrypted credential map stored on the provider
 * record; each factory picks the keys it needs and refuses when one is
 * missing, so a half-configured provider fails at the first call, loudly.
 */

export type ProviderCredentials = Record<string, string | undefined>;

interface ProviderDefinition {
  displayName: string;
  /** Credential keys the admin form asks for, in order. */
  credentialKeys: readonly string[];
  /** Keys that must stay encrypted at rest. */
  secretKeys: readonly string[];
  /** The shopper may pick the day the plan starts (ORD-03): the date is sent with the purchase. */
  scheduledActivation?: boolean;
  create(credentials: ProviderCredentials, settlementCurrency: string): EsimProviderAdapter;
}

function required(credentials: ProviderCredentials, key: string, provider: string): string {
  const value = credentials[key]?.trim();
  if (!value) throw new ProviderError("credentials_missing", `${provider}: "${key}" is not configured`);
  return value;
}

export const PROVIDER_DEFINITIONS = {
  esimaccess: {
    displayName: "eSIM Access",
    credentialKeys: ["accessCode", "baseUrl"],
    secretKeys: ["accessCode"],
    create: (credentials) =>
      new EsimAccessAdapter({
        accessCode: required(credentials, "accessCode", "eSIM Access"),
        baseUrl: credentials.baseUrl || undefined,
      }),
  },
  stellar: {
    displayName: "Stellar",
    credentialKeys: ["apiKey", "baseUrl"],
    secretKeys: ["apiKey"],
    create: (credentials) =>
      new StellarAdapter({
        apiKey: required(credentials, "apiKey", "Stellar"),
        baseUrl: credentials.baseUrl || undefined,
      }),
  },
  roamwifi: {
    displayName: "RoamWifi",
    credentialKeys: ["phoneNumber", "password", "signKey", "baseUrl"],
    secretKeys: ["password", "signKey"],
    create: (credentials, settlementCurrency) =>
      new RoamWifiAdapter({
        phoneNumber: required(credentials, "phoneNumber", "RoamWifi"),
        password: required(credentials, "password", "RoamWifi"),
        signKey: credentials.signKey || undefined,
        currency: settlementCurrency,
        baseUrl: credentials.baseUrl || undefined,
      }),
  },
  bnesim: {
    displayName: "BNESIM",
    credentialKeys: ["apiKey", "apiSecret", "type", "baseUrl"],
    secretKeys: ["apiSecret"],
    // add-esim takes scheduled_activation_date.
    scheduledActivation: true,
    create: (credentials, settlementCurrency) =>
      new BnesimAdapter({
        apiKey: required(credentials, "apiKey", "BNESIM"),
        apiSecret: required(credentials, "apiSecret", "BNESIM"),
        type: credentials.type || undefined,
        currency: settlementCurrency,
        baseUrl: credentials.baseUrl || undefined,
      }),
  },
  mobimatter: {
    displayName: "MobiMatter",
    credentialKeys: ["merchantId", "apiKey", "baseUrl"],
    secretKeys: ["apiKey"],
    create: (credentials) =>
      new MobiMatterAdapter({
        merchantId: required(credentials, "merchantId", "MobiMatter"),
        apiKey: required(credentials, "apiKey", "MobiMatter"),
        baseUrl: credentials.baseUrl || undefined,
      }),
  },
} satisfies Record<string, ProviderDefinition>;

export type ProviderCode = keyof typeof PROVIDER_DEFINITIONS;

export const PROVIDER_CODES = Object.keys(PROVIDER_DEFINITIONS) as ProviderCode[];

export function isProviderCode(code: string): code is ProviderCode {
  return Object.hasOwn(PROVIDER_DEFINITIONS, code);
}

/** Whether a supplier takes a start date with the purchase (ORD-03); the fake does, for tests. */
export function supportsScheduledActivation(code: string): boolean {
  if (/^fake(-[a-z0-9]+)?$/.test(code)) return fakeEnabled();
  return isProviderCode(code) && (PROVIDER_DEFINITIONS[code] as ProviderDefinition).scheduledActivation === true;
}

/** The testing supplier exists only where a developer switched it on. */
function fakeEnabled() {
  return process.env.ESIM_ENABLE_FAKE_PROVIDER === "true";
}

const FAKE_MODES: readonly FakeMode[] = ["fulfil", "pending", "reject", "uncertain"];

export function createAdapter(
  code: string,
  credentials: ProviderCredentials,
  settlementCurrency: string,
): EsimProviderAdapter {
  // "fake", "fake-reject", … so a test can line up suppliers that behave differently.
  if (/^fake(-[a-z0-9]+)?$/.test(code) && fakeEnabled()) {
    const mode = (credentials.mode ?? "fulfil") as FakeMode;
    if (!FAKE_MODES.includes(mode)) throw new ProviderError("credentials_missing", `Fake mode "${mode}" is unknown`);
    return new FakeAdapter({ mode, nonIdempotentTopup: credentials.nonIdempotent === "topup" });
  }
  if (!isProviderCode(code)) {
    throw new ProviderError("unsupported", `No adapter for provider "${code}"`);
  }
  return PROVIDER_DEFINITIONS[code].create(credentials, settlementCurrency);
}

import { EsimAccessAdapter } from "./esim-access";
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
} satisfies Record<string, ProviderDefinition>;

export type ProviderCode = keyof typeof PROVIDER_DEFINITIONS;

export const PROVIDER_CODES = Object.keys(PROVIDER_DEFINITIONS) as ProviderCode[];

export function isProviderCode(code: string): code is ProviderCode {
  return Object.hasOwn(PROVIDER_DEFINITIONS, code);
}

export function createAdapter(
  code: string,
  credentials: ProviderCredentials,
  settlementCurrency: string,
): EsimProviderAdapter {
  if (!isProviderCode(code)) {
    throw new ProviderError("unsupported", `No adapter for provider "${code}"`);
  }
  return PROVIDER_DEFINITIONS[code].create(credentials, settlementCurrency);
}

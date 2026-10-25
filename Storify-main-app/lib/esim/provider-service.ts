import "server-only";

import { EsimProvider, type IEsimProvider } from "@/models/esim-provider.model";
import { decryptCredential, encryptCredential } from "@/lib/esim/secrets";
import {
  PROVIDER_DEFINITIONS,
  createAdapter,
  isProviderCode,
  type ProviderCredentials,
} from "@/lib/esim/providers/registry";
import { ProviderError, type EsimProviderAdapter } from "@/lib/esim/providers/types";

/**
 * Loading a supplier record into a working adapter, and storing its
 * credentials. The only place secret credentials are decrypted.
 */

export async function findProvider(code: string) {
  return EsimProvider.findOne({ code }).select("+secretCredentials");
}

export function credentialsOf(provider: IEsimProvider): ProviderCredentials {
  const credentials: ProviderCredentials = Object.fromEntries(provider.credentials ?? new Map());
  for (const [key, secret] of provider.secretCredentials ?? new Map()) {
    credentials[key] = decryptCredential(secret);
  }
  return credentials;
}

/** The provider record must have been loaded with `+secretCredentials`. */
export function adapterFor(provider: IEsimProvider): EsimProviderAdapter {
  if (provider.status !== "active") {
    throw new ProviderError("unsupported", `Provider ${provider.code} is disabled`);
  }
  return createAdapter(provider.code, credentialsOf(provider), provider.settlementCurrency);
}

/**
 * Writes credentials from the admin form: keys the provider declares secret
 * are encrypted, the rest stored as-is. An empty value clears the key; a key
 * left out of `values` keeps what is stored, so the form can omit secrets it
 * never shows back.
 */
export function applyCredentials(provider: IEsimProvider, values: Record<string, string | undefined>) {
  if (!isProviderCode(provider.code)) {
    throw new ProviderError("unsupported", `No adapter for provider "${provider.code}"`);
  }
  const definition = PROVIDER_DEFINITIONS[provider.code];
  for (const key of definition.credentialKeys) {
    if (!(key in values)) continue;
    const value = values[key]?.trim() ?? "";
    const secret = (definition.secretKeys as readonly string[]).includes(key);
    const target = secret ? provider.secretCredentials : provider.credentials;
    if (!value) {
      target.delete(key);
    } else if (secret) {
      provider.secretCredentials.set(key, encryptCredential(value));
    } else {
      provider.credentials.set(key, value);
    }
  }
  provider.markModified("credentials");
  provider.markModified("secretCredentials");
}

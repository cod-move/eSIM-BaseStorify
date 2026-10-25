import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { EncryptedSecret } from "@/lib/auth/secret-box";

/**
 * AES-256-GCM for eSIM provider credentials, in the same envelope as
 * `lib/auth/secret-box.ts` (which keys its own names in a closed union, so
 * eSIM keeps its key here rather than patching that file).
 *
 * `ESIM_ENCRYPTION_KEY` falls back to `MESSAGING_ENCRYPTION_KEY`, the way the
 * carrier and Meta catalog keys do, so a deployment works without a new
 * variable and can separate the keys later. Changing the key means entering
 * the provider credentials again.
 */

function key(): Buffer {
  const configured = process.env.ESIM_ENCRYPTION_KEY || process.env.MESSAGING_ENCRYPTION_KEY;
  if (!configured || configured.length < 32) {
    throw new Error("ESIM_ENCRYPTION_KEY (or MESSAGING_ENCRYPTION_KEY) must be at least 32 characters");
  }
  return createHash("sha256").update(configured, "utf8").digest();
}

export function encryptCredential(plaintext: string): EncryptedSecret {
  if (!plaintext.trim()) throw new Error("Credential cannot be empty");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptCredential(secret: EncryptedSecret): string {
  if (secret.version !== 1 || secret.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted credential");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(secret.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

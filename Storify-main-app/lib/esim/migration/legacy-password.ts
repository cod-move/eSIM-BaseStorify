import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { mongoose } from "@/lib/db";

/**
 * Passwords migrated from the old Laravel store (patch P16, MIG): bcrypt
 * hashes (`$2y$…`, `$2a$…`, `$2b$…`) are checked with bcrypt and, on a match,
 * replaced by a hash in Better Auth's own format, so each migrated shopper
 * moves off bcrypt the first time they sign in. Every other hash goes to
 * Better Auth's own check, unchanged.
 */

const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

export function isLegacyHash(hash: string): boolean {
  return BCRYPT.test(hash);
}

/** Laravel writes "$2y$"; bcryptjs reads it as "$2a$", the same algorithm. */
export async function checkLegacyPassword(hash: string, password: string): Promise<boolean> {
  return bcrypt.compare(password, hash.replace(/^\$2y\$/, "$2a$"));
}

/** The credential account still holding this exact bcrypt hash gets the new one. Never throws. */
async function upgrade(hash: string, password: string) {
  try {
    const next = await hashPassword(password);
    await mongoose.connection.db?.collection("account").updateOne({ providerId: "credential", password: hash }, { $set: { password: next, updatedAt: new Date() } });
  } catch (error) {
    console.error("Upgrading a migrated password failed:", error);
  }
}

/** Better Auth's `emailAndPassword.password.verify` with the old store's hashes understood. */
export async function verifyAnyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  if (!isLegacyHash(hash)) return verifyPassword({ hash, password });
  const ok = await checkLegacyPassword(hash, password);
  if (ok) await upgrade(hash, password);
  return ok;
}

import { TOPCONNECT_MB } from "@/lib/esim/numbers/packages";

/**
 * A number card's install details and card facts (NUM-06/07), the parts with
 * no database.
 */

/** "LPA:1$smdp.example.com$ABC-123" → its SM-DP+ address and matching ID, for installing by hand. */
export function parseLpa(lpa: string | null | undefined): { smdpAddress: string | null; matchingId: string | null } {
  const match = /^LPA:1\$([^$]+)\$([^$]+)/.exec(lpa?.trim() ?? "");
  return { smdpAddress: match?.[1] ?? null, matchingId: match?.[2] ?? null };
}

/** A number lives a year after its last use (NUM-06); before any use, a year after it was bought. */
export function numberValidUntil(input: { lastUsedAt?: Date | null; soldAt?: Date | null }): Date | null {
  const from = input.lastUsedAt ?? input.soldAt ?? null;
  if (!from) return null;
  const until = new Date(from);
  until.setUTCFullYear(until.getUTCFullYear() + 1);
  return until;
}

/** TopConnect's bytes as "512 MB" / "4.9 GB" (its megabyte is 1,024,000 bytes). */
export function formatCardBytes(bytes: number | null | undefined): string | null {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return null;
  const mb = bytes / TOPCONNECT_MB;
  if (mb >= 1000) return `${(mb / 1000).toFixed(mb >= 10_000 ? 0 : 1)} GB`;
  return `${Math.round(mb)} MB`;
}

/** How much of a package is left, 0–100, or null when the card does not say. */
export function packageLeftPercent(total: number | null | undefined, left: number | null | undefined): number | null {
  if (!total || total <= 0 || left === null || left === undefined) return null;
  return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
}

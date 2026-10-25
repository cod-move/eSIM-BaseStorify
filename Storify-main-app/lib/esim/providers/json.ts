import type { JsonObject, JsonValue } from "./types";

/**
 * Defensive readers for provider payloads. Provider APIs drift — a number
 * arrives as a string, an array as null — so adapters read every field through
 * these instead of trusting the declared shape.
 */

export function obj(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

export function objArray(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value)
    ? value.map(obj).filter((item) => Object.keys(item).length > 0)
    : [];
}

export function str(value: JsonValue | undefined): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function strOrNull(value: JsonValue | undefined): string | null {
  return str(value) || null;
}

export function num(value: JsonValue | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function int(value: JsonValue | undefined): number | null {
  const parsed = num(value);
  return parsed === null ? null : Math.trunc(parsed);
}

export function bool(value: JsonValue | undefined): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(text)) return true;
    if (["0", "false", "no", "n"].includes(text)) return false;
  }
  return null;
}

export function iso2(value: JsonValue | undefined): string | null {
  const code = str(value).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function currency(value: JsonValue | undefined, fallback: string): string {
  const code = str(value).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

/** "FR/NL/UK" or "3G/4G/5G" → ["FR","NL","UK"]. */
export function splitList(value: JsonValue | undefined, separator: RegExp = /[\/,]/): string[] {
  return [
    ...new Set(
      str(value)
        .split(separator)
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Country codes as suppliers write them ("UK", "fr") → ISO 3166-1 alpha-2,
 * deduplicated. "UK" is the one common non-ISO spelling (ISO says GB).
 */
export function countryCodes(codes: string[]): string[] {
  return [
    ...new Set(
      codes
        .map((code) => code.trim().toUpperCase())
        .map((code) => (code === "UK" ? "GB" : code))
        .filter((code) => /^[A-Z]{2}$/.test(code)),
    ),
  ];
}

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "LPA:1$smdp.example.com$MATCHING" → its two halves. */
export function parseLpa(code: string | null): { smdpAddress: string | null; matchingId: string | null } {
  const match = code?.match(/^LPA:1\$([^$]+)\$([^$]+)/);
  return match
    ? { smdpAddress: match[1], matchingId: match[2] }
    : { smdpAddress: null, matchingId: null };
}

export function megabytesLabel(megabytes: number): string {
  if (megabytes <= 0) return "";
  if (megabytes >= 1024 && megabytes % 1024 === 0) return `${megabytes / 1024}GB`;
  if (megabytes >= 1024) return `${Math.round((megabytes / 1024) * 100) / 100}GB`;
  return `${megabytes}MB`;
}

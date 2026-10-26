import { clampDays, validityValue, type PerDayPricing } from "@/lib/esim/catalog/variants";

/**
 * What a cart or order line carries in its generic `lineAttributes` field
 * (patch point P10). Pure.
 *
 * - `days`: the number of days of a day-priced plan.
 * - `topup`: the top-up quote a top-up line is for (lib/esim/topup). The
 *   server adds `iccid` (the eSIM topped up) and `label` (the line's name)
 *   from the quote; whatever a request sends for those two is ignored.
 *
 * A cart holds one line per variant, as Storify's cart does. Adding the same
 * variant again with other days replaces the days (the shopper changed their
 * mind on the product page) rather than opening a second line: every cart
 * surface — item ids, the quantity stepper, the app — tells lines apart by
 * product and variant alone.
 */
export interface EsimLineAttributes {
  days?: number;
  topup?: string;
  iccid?: string | null;
  label?: string;
}

export class LineAttributesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LineAttributesError";
  }
}

/** The request's attributes, checked for shape; `null` when there are none. */
export function parseLineAttributes(input: unknown): EsimLineAttributes | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new LineAttributesError("Line options must be an object");
  }
  const entries = Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return null;
  const parsed: EsimLineAttributes = {};
  for (const [key, value] of entries) {
    if (key === "iccid" || key === "label") continue;
    if (key === "days") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 3650) {
        throw new LineAttributesError("The number of days must be a whole number");
      }
      parsed.days = value;
    } else if (key === "topup") {
      if (typeof value !== "string" || !/^[a-f0-9]{24}$/i.test(value)) throw new LineAttributesError("Unknown top-up");
      parsed.topup = value;
    } else {
      throw new LineAttributesError(`Unknown line option "${key}"`);
    }
  }
  if (parsed.days !== undefined && parsed.topup !== undefined) {
    throw new LineAttributesError("A top-up takes no number of days");
  }
  return Object.keys(parsed).length ? parsed : null;
}

/**
 * The attributes a day-priced line is stored with: the requested days, which
 * must lie in the variant's range, or its default. A line for a variant that
 * is not day-priced takes none.
 */
export function resolveLineAttributes(
  requested: EsimLineAttributes | null,
  perDay: PerDayPricing | null,
): EsimLineAttributes | null {
  if (!perDay) {
    if (requested) throw new LineAttributesError("This option takes no number of days");
    return null;
  }
  const days = requested?.days ?? perDay.defaultDays;
  if (days < perDay.minDays || days > perDay.maxDays) {
    throw new LineAttributesError(`Choose between ${perDay.minDays} and ${perDay.maxDays} days`);
  }
  return { days };
}

/** The days a stored day-priced line is charged and bought for. */
export function lineDays(attributes: unknown, perDay: PerDayPricing): number {
  const days = attributes && typeof attributes === "object" ? (attributes as EsimLineAttributes).days : undefined;
  return clampDays(days, perDay);
}

export function linePriceMinor(perDay: PerDayPricing, days: number): number {
  return perDay.priceMinor * days;
}

/**
 * The line's variant name with the chosen days in place of the range:
 * "Unlimited / 1–365 days" → "Unlimited / 7 days". Shown by the cart,
 * checkout, the order and its emails without any of them knowing about days.
 */
export function lineVariantName(variantName: string, days: number): string {
  const cut = variantName.lastIndexOf(" / ");
  const data = cut === -1 ? variantName : variantName.slice(0, cut);
  return `${data} / ${validityValue(days)}`;
}

type VariantSnapshot = { variantLabel?: string; variantOptions?: Array<{ name: string; value: string }> };

/**
 * An order line's frozen variant (`orderLineVariantSnapshot`) as bought: the
 * catalogue's "1–365 days" replaced by the days the line carries, and a
 * top-up's "Data top-up" by the top-up and its eSIM, so the order page,
 * invoice and emails say what was sold.
 */
export function withLineDays<S extends VariantSnapshot>(line: { lineAttributes?: unknown }, snapshot: S): S {
  const attributes = line.lineAttributes && typeof line.lineAttributes === "object"
    ? (line.lineAttributes as EsimLineAttributes)
    : undefined;
  const label = attributes?.topup && typeof attributes.label === "string" ? attributes.label : null;
  if (label) {
    return {
      ...snapshot,
      ...(snapshot.variantLabel ? { variantLabel: label } : {}),
      ...(snapshot.variantOptions
        ? { variantOptions: snapshot.variantOptions.map((option, index) => (index === 0 ? { ...option, value: label } : option)) }
        : {}),
    };
  }
  const days = attributes?.days;
  if (typeof days !== "number") return snapshot;
  return {
    ...snapshot,
    ...(snapshot.variantLabel ? { variantLabel: lineVariantName(snapshot.variantLabel, days) } : {}),
    ...(snapshot.variantOptions
      ? {
          variantOptions: snapshot.variantOptions.map((option) =>
            option.name === "Validity" ? { ...option, value: validityValue(days) } : option,
          ),
        }
      : {}),
  };
}

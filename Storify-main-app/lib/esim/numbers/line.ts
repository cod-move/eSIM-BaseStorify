/**
 * A number-card cart line (NUM-03/04), the parts with no database: the
 * shopper's choice as `lineAttributes.number`, the first recharge's bounds,
 * the line's name and price.
 *
 * TopConnect amounts are chosen in TopConnect's own currency (euros, decided
 * 2026-11-03): a first recharge of €10 puts €10 on the card, and the shopper
 * pays its USD equivalent at the day's rate plus the FX buffer, no markup.
 * A data package is priced by the pricing rules (lib/esim/numbers/packages.ts).
 */

/** What the shopper asks for: the number, a first recharge in cents of TopConnect's currency (whole units), a data package. */
export interface NumberLineChoice {
  id: string;
  recharge?: number;
  packet?: string;
}

/**
 * What checkout settles the line to and the order keeps: the choice with the
 * prices it was charged, so the paid order is carried out from this
 * snapshot whatever changes later (NUM-05).
 */
export interface NumberLineSnapshot extends NumberLineChoice {
  msisdn: string;
  numberMinor: number;
  premiumMinor: number;
  recharge: number;
  rechargeCurrency: string;
  rechargeUsdMinor: number;
  packet?: string;
  packetId?: string;
  packetName?: string;
  packetCost?: { amountMinor: number; currency: string };
  packetUsdMinor: number;
}

/**
 * A recharge (the first one bought with a number, and later ones) is a whole
 * amount from the minimum set under Admin → eSIM → Numbers (€5 unless
 * changed, never under €1) up to 300. A number is always sold with one.
 */
export const RECHARGE_FLOOR_MINOR = 100;
export const RECHARGE_DEFAULT_MIN_MINOR = 500;
export const RECHARGE_MAX_MINOR = 30_000;
const RECHARGE_SUGGESTIONS_MINOR = [500, 1000, 2000, 5000];
/** The amount picked for the shopper to start with: €5, or the minimum when that is higher. */
const RECHARGE_PRESET_MINOR = 500;

/** The amounts offered as buttons for a minimum: the usual ones it allows, led by the minimum itself. */
export function rechargeSuggestions(minMinor: number): number[] {
  const allowed = RECHARGE_SUGGESTIONS_MINOR.filter((amount) => amount >= minMinor);
  return allowed[0] === minMinor ? allowed : [minMinor, ...allowed].slice(0, 4);
}

/** The amount selected when the dialog opens. */
export const rechargePreset = (minMinor: number) => Math.max(minMinor, RECHARGE_PRESET_MINOR);

/** Why a recharge cannot be taken, or null. */
export function rechargeProblem(minor: number, minMinor = RECHARGE_DEFAULT_MIN_MINOR): string | null {
  if (!Number.isInteger(minor) || minor <= 0 || minor % 100 !== 0) return "Choose a whole amount to put on the number";
  if (minor < minMinor || minor > RECHARGE_MAX_MINOR) {
    return `Choose an amount between ${minMinor / 100} and ${RECHARGE_MAX_MINOR / 100}`;
  }
  return null;
}

/** The USD cents a recharge costs: the day's rate plus the FX buffer, rounded up so the store never loses on it. */
export function rechargeUsdMinor(minor: number, usdPerUnit: number, fxBufferPercent: number): number {
  if (minor === 0) return 0;
  if (!(usdPerUnit > 0)) throw new Error("No exchange rate for the recharge currency");
  return Math.ceil(minor * usdPerUnit * (1 + fxBufferPercent / 100) - 1e-9);
}

export const numberLinePriceMinor = (line: Pick<NumberLineSnapshot, "numberMinor" | "premiumMinor" | "rechargeUsdMinor" | "packetUsdMinor">) =>
  line.numberMinor + line.premiumMinor + line.rechargeUsdMinor + line.packetUsdMinor;

const CURRENCY_SIGNS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function formatAmount(minor: number, currency: string): string {
  const sign = CURRENCY_SIGNS[currency.toUpperCase()];
  const value = minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
  return sign ? `${sign}${value}` : `${value} ${currency.toUpperCase()}`;
}

/** "+372 55501234 · €10 credit · EU+ 5GB": the cart, checkout, order and emails show this. */
export function numberLineLabel(input: { dialCode: string; nationalNumber: string; recharge: number; rechargeCurrency: string; packetName?: string | null }): string {
  return [
    `+${input.dialCode} ${input.nationalNumber}`,
    input.recharge ? `${formatAmount(input.recharge, input.rechargeCurrency)} credit` : null,
    input.packetName || null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** The request's `number` option, checked for shape; throws a message for the shopper. */
export function parseNumberChoice(value: unknown): NumberLineChoice {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a number");
  const input = value as Record<string, unknown>;
  if (typeof input.id !== "string" || !OBJECT_ID.test(input.id)) throw new Error("Choose a number");
  const choice: NumberLineChoice = { id: input.id };
  // The shape only: the cart holds the amount to the minimum the admin set.
  if (input.recharge !== undefined && input.recharge !== null) {
    if (typeof input.recharge !== "number") throw new Error("Choose a whole amount to put on the number");
    const problem = rechargeProblem(input.recharge, RECHARGE_FLOOR_MINOR);
    if (problem) throw new Error(problem);
    choice.recharge = input.recharge;
  }
  if (input.packet !== undefined && input.packet !== null && input.packet !== "") {
    if (typeof input.packet !== "string" || !OBJECT_ID.test(input.packet)) throw new Error("Unknown data package");
    choice.packet = input.packet;
  }
  return choice;
}

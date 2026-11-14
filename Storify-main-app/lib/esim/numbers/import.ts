import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * Number stock import (NUM-01), pure: text as TopConnect delivers it, or a
 * CSV, into rows ready to store.
 *
 * One card per line, fields split by commas, semicolons or tabs (or by
 * spaces when the line has none, as in the supplier's sheet), in the order
 * the supplier's sheet and the old store use:
 *
 *   MSISDN ICCID LPA PIN1 PUK1 PIN2 PUK2 [PRICE PREMIUM]
 *
 * A header line (holding both "MSISDN" and "ICCID") is skipped. PRICE and
 * PREMIUM, in the card currency (TopConnect's), override the batch's; the old CSV's tenth column (a QR
 * image file name) is ignored, as the QR is drawn from the LPA. A number may
 * come with or without its country code: with a batch dial code the code is
 * added when missing; without one the number must carry it.
 */

export interface NumberImportOptions {
  /** Country calling code for the batch, digits only ("372"). */
  dialCode?: string;
  /** Per-number price and premium, cents of the card currency, unless a line sets its own. */
  priceMinor: number;
  premiumMinor: number;
}

export interface NumberImportRow {
  line: number;
  /** Full international number, digits only. */
  msisdn: string;
  dialCode: string;
  nationalNumber: string;
  /** ISO-2, when the number belongs to one country. */
  country: string | null;
  iccid: string;
  lpa: string;
  pin1: string | null;
  puk1: string | null;
  pin2: string | null;
  puk2: string | null;
  priceMinor: number;
  premiumMinor: number;
}

export interface NumberImportProblem {
  line: number;
  reason: "fields" | "msisdn" | "iccid" | "lpa" | "price" | "duplicate";
  text: string;
}

export const MAX_IMPORT_LINES = 5000;

export function parseNumberImport(
  input: string,
  options: NumberImportOptions,
): { rows: NumberImportRow[]; problems: NumberImportProblem[] } {
  const dial = options.dialCode?.replace(/\D/g, "") || undefined;
  const rows: NumberImportRow[] = [];
  const problems: NumberImportProblem[] = [];
  const seenMsisdn = new Set<string>();
  const seenIccid = new Set<string>();

  input.split(/\r\n|\n|\r/).slice(0, MAX_IMPORT_LINES).forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();
    if (!text) return;
    const upper = text.toUpperCase();
    if (upper.includes("MSISDN") && upper.includes("ICCID")) return;
    const problem = (reason: NumberImportProblem["reason"]) => problems.push({ line, reason, text: text.slice(0, 120) });

    const fields = text.split(/[,;\t]/.test(text) ? /\s*[,;\t]\s*/ : /\s+/).map((field) => field.replace(/^"|"$/g, "").trim());
    if (fields.length < 3) return problem("fields");
    const [msisdnField, iccidField, lpaField, pin1, puk1, pin2, puk2, priceField, premiumField] = fields;

    const number = phoneNumber(msisdnField!, dial);
    if (!number) return problem("msisdn");
    const iccid = iccidField!.toUpperCase();
    if (!/^\d{18,22}F?$/.test(iccid)) return problem("iccid");
    const lpa = activationCode(lpaField!);
    if (!lpa) return problem("lpa");
    const priceMinor = priceField ? dollarsToCents(priceField) : options.priceMinor;
    const premiumMinor = premiumField ? dollarsToCents(premiumField) : options.premiumMinor;
    if (priceMinor === null || premiumMinor === null) return problem("price");
    if (seenMsisdn.has(number.msisdn) || seenIccid.has(iccid)) return problem("duplicate");
    seenMsisdn.add(number.msisdn);
    seenIccid.add(iccid);

    rows.push({
      line,
      ...number,
      iccid,
      lpa,
      pin1: secretCode(pin1),
      puk1: secretCode(puk1),
      pin2: secretCode(pin2),
      puk2: secretCode(puk2),
      priceMinor,
      premiumMinor,
    });
  });
  return { rows, problems };
}

/** A number in the batch's country, or carrying its own code → its parts; null when it is no phone number. */
export function phoneNumber(
  raw: string,
  dial?: string,
): { msisdn: string; dialCode: string; nationalNumber: string; country: string | null } | null {
  let digits = raw.replace(/[\s()+.-]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (!/^\d{5,17}$/.test(digits)) return null;
  // The batch's code when the number lacks it (a national number keeps at least 6 digits after it).
  const full = dial && !(digits.startsWith(dial) && digits.length - dial.length >= 6) ? `${dial}${digits.replace(/^0+/, "")}` : digits;
  const parsed = parsePhoneNumberFromString(`+${full}`);
  if (!parsed || !parsed.isValid() || (dial && parsed.countryCallingCode !== dial)) {
    if (!dial) return null;
    // A range the phone library does not know yet (new mobile blocks): trust the batch's code.
    return { msisdn: full, dialCode: dial, nationalNumber: full.slice(dial.length), country: null };
  }
  return {
    msisdn: full,
    dialCode: parsed.countryCallingCode,
    nationalNumber: String(parsed.nationalNumber),
    country: parsed.country ?? null,
  };
}

/** "LPA:1$smdp$code", or "smdp$code" without the prefix → the LPA string. */
function activationCode(raw: string): string | null {
  const value = raw.trim();
  const body = value.replace(/^LPA:1\$/i, "");
  if (!/^[A-Za-z0-9.-]+\$[A-Za-z0-9._-]+(\$.*)?$/.test(body)) return null;
  return `LPA:1$${body}`;
}

function secretCode(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value && /^\d{4,10}$/.test(value) ? value : null;
}

/** "12", "12.5", "12.50" → cents; anything else → null. */
export function dollarsToCents(raw: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(raw.trim().replace(/^\$/, ""));
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** A number's new card, as TopConnect sends it for a new QR code. */
export interface ReplacementCard {
  iccid: string;
  lpa: string;
  pin1: string | null;
  puk1: string | null;
  pin2: string | null;
  puk2: string | null;
}

/**
 * The line an admin pastes when a number moves to a new eSIM profile, in
 * the import's order without the number: `ICCID LPA PIN1 PUK1 PIN2 PUK2`,
 * split by spaces (or commas, semicolons, tabs). The ICCID and the LPA are
 * needed; a PIN or PUK that is not 4–10 digits is refused rather than lost.
 */
export function parseReplacementCard(input: string): { ok: true; card: ReplacementCard } | { ok: false; reason: "fields" | "iccid" | "lpa" | "pin" } {
  const text = input.trim();
  const fields = text.split(/[,;\t]/.test(text) ? /\s*[,;\t]\s*/ : /\s+/).map((field) => field.replace(/^"|"$/g, "").trim()).filter(Boolean);
  if (fields.length < 2 || fields.length > 6) return { ok: false, reason: "fields" };
  const [iccidField, lpaField, ...secrets] = fields;
  const iccid = iccidField!.toUpperCase();
  if (!/^\d{18,22}F?$/.test(iccid)) return { ok: false, reason: "iccid" };
  const lpa = activationCode(lpaField!);
  if (!lpa) return { ok: false, reason: "lpa" };
  if (secrets.some((value) => secretCode(value) === null)) return { ok: false, reason: "pin" };
  const [pin1, puk1, pin2, puk2] = [0, 1, 2, 3].map((index) => secretCode(secrets[index]));
  return { ok: true, card: { iccid, lpa, pin1: pin1!, puk1: puk1!, pin2: pin2!, puk2: puk2! } };
}

/** The same card whatever the trailing "F" TopConnect sometimes adds. */
export const sameIccid = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toUpperCase().replace(/F$/, "") === b.toUpperCase().replace(/F$/, "");

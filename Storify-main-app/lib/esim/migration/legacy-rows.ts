/**
 * Rows read from the old Laravel store (MIG) and what they become here —
 * pure, so the rules are tested without either database.
 *
 * Ported from the rewrite's importer (eSIM-Platform `legacy-mysql-import.ts`),
 * which ran against the live database on 2026-08-08 and reconciled to zero
 * differences: only email-verified users, Laravel bcrypt hashes kept as they
 * are (patch P16 upgrades them at first sign-in), status 1 active and anything
 * else banned. Added here: the active data eSIMs, which the rewrite left out.
 */

export interface LegacyUserRow {
  id: number;
  firstname: string | null;
  lastname: string | null;
  username: string | null;
  email: string;
  dial_code: string | null;
  mobile: string | null;
  ref_by: number | null;
  balance: string;
  password: string;
  country_code: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  address: string | null;
  status: number;
  ev: number;
  sv: number;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface LegacyEsimRow {
  id: number;
  user_id: number;
  provider_slug: string | null;
  provider_plan_id: string | null;
  plan_name: string | null;
  purchase_id: string | null;
  serial_number: string | null;
  provider_sim_id: string | null;
  iccid: string | null;
  phone_number: string | null;
  /** The LPA activation code ("LPA:1$smdp$matching"). */
  qr_code: string | null;
  activation_deadline: Date | null;
  expiry_date: Date | null;
  profile_status: string | null;
  remark: string | null;
  /** JSON text. */
  info: string | null;
  status: number;
  created_at: Date | null;
}

/** A number card in the old store's stock (`inventory_esims`), sold or not. */
export interface LegacyNumberRow {
  id: number;
  iccid: string | null;
  msisdn: string | null;
  dial_country_code: string | null;
  lpa: string | null;
  pin1: string | null;
  puk1: string | null;
  pin2: string | null;
  puk2: string | null;
  /** Decimal text. */
  price: string | null;
  premium_price: string | null;
  /** 0 available, 1 sold. */
  status: number;
  /** The buyer: the order's user, else the user of the eSIM made from it. */
  user_id: number | null;
  sold_at: Date | null;
  created_at: Date | null;
}

export interface MigratedNumber {
  legacyId: number;
  iccid: string;
  msisdn: string;
  dialCode: string;
  lpa: string;
  pin1: string | null;
  puk1: string | null;
  pin2: string | null;
  puk2: string | null;
  priceMinor: number;
  premiumMinor: number;
  sold: boolean;
  userLegacyId: number | null;
  soldAt: Date | null;
  createdAt: Date;
}

export interface MigratedUser {
  legacyId: number;
  refByLegacyId: number | null;
  email: string;
  passwordHash: string;
  name: string;
  phone: string | null;
  status: "active" | "banned";
  balanceMinor: number;
  address: { country: string | null; city: string | null; state: string | null; postalCode: string | null; street: string | null };
  createdAt: Date;
  updatedAt: Date;
}

export interface MigratedEsim {
  legacyId: number;
  userLegacyId: number;
  providerCode: string;
  /** Null when the old order line lost its plan: the import puts it on a stand-in plan. */
  providerPlanId: string | null;
  planName: string | null;
  iccid: string;
  simId: string | null;
  providerOrderId: string | null;
  activationCode: string | null;
  smdpAddress: string | null;
  matchingId: string | null;
  expiresAt: Date | null;
  activationDeadline: Date | null;
  profileStatus: "released" | "installed" | "enabled" | "disabled" | "deleted" | "unknown" | null;
  remark: string | null;
  createdAt: Date;
}

/** Why a row is left out; counted on the admin page, never listed with personal data. */
export type SkipReason =
  | "user.unverified"
  | "user.bad-email"
  | "user.bad-password"
  | "esim.not-active"
  | "esim.no-iccid"
  | "esim.no-provider"
  | "number.no-iccid"
  | "number.no-msisdn"
  | "number.no-lpa";

const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const DECIMAL = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const PROFILE_STATUSES = new Set(["released", "installed", "enabled", "disabled", "deleted", "unknown"]);

/**
 * A legacy column as trimmed text. MySQL hands back numbers, dates and
 * buffers too (a phone or ICCID column typed as a number, a BLOB), so any
 * value is turned into text first.
 */
const text = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const raw =
    typeof value === "string"
      ? value
      : Buffer.isBuffer(value)
        ? value.toString("utf8")
        : value instanceof Date
          ? (Number.isNaN(value.getTime()) ? "" : value.toISOString())
          : typeof value === "number" || typeof value === "bigint" || typeof value === "boolean"
            ? String(value)
            : "";
  return raw.trim() || null;
};
const validDate = (value: Date | null | undefined) => (value instanceof Date && !Number.isNaN(value.getTime()) ? value : null);
const digits = (value: string | null | undefined) => value?.replace(/\D/g, "") ?? "";

/** A decimal string to cents, half up, exactly (no float on the way). */
export function decimalToMinor(value: string): number {
  const normalized = String(value).trim();
  if (!DECIMAL.test(normalized)) throw new Error(`Invalid non-negative amount: ${value}`);
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return cents + (Number((fraction + "000")[2]) >= 5 ? 1 : 0);
}

export function migrateUser(row: LegacyUserRow, now = new Date()): MigratedUser | SkipReason {
  if (Number(row.ev) !== 1) return "user.unverified";
  const email = String(row.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "user.bad-email";
  if (!BCRYPT.test(String(row.password ?? ""))) return "user.bad-password";
  const createdAt = validDate(row.created_at) ?? validDate(row.updated_at) ?? now;
  const name = [text(row.firstname), text(row.lastname)].filter(Boolean).join(" ") || text(row.username) || email.split("@")[0];
  const mobile = digits(row.mobile);
  const dial = digits(row.dial_code);
  const country = text(row.country_code)?.toUpperCase() ?? null;
  return {
    legacyId: Number(row.id),
    refByLegacyId: Number(row.ref_by) > 0 ? Number(row.ref_by) : null,
    email,
    passwordHash: row.password,
    name: name.slice(0, 100),
    phone: mobile ? `+${mobile.startsWith(dial) || !dial ? mobile : `${dial}${mobile}`}` : null,
    status: Number(row.status) === 1 ? "active" : "banned",
    balanceMinor: decimalToMinor(row.balance ?? "0"),
    address: {
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      city: text(row.city),
      state: text(row.state),
      postalCode: text(row.zip),
      street: text(row.address),
    },
    createdAt,
    updatedAt: validDate(row.updated_at) ?? createdAt,
  };
}

/** "LPA:1$smdp$matching" into its parts; anything else carries no parts. */
export function parseLpa(code: string | null): { smdpAddress: string | null; matchingId: string | null } {
  if (!code?.startsWith("LPA:1$")) return { smdpAddress: null, matchingId: null };
  const [, smdp, matching] = code.split("$");
  return { smdpAddress: text(smdp), matchingId: text(matching) };
}

function infoOrderNumber(info: string | null): string | null {
  if (!info) return null;
  try {
    const parsed = JSON.parse(info) as Record<string, unknown> | null;
    const value = parsed?.order_num ?? parsed?.orderNo ?? parsed?.order_no;
    return typeof value === "string" || typeof value === "number" ? String(value) : null;
  } catch {
    return null;
  }
}

/** An active eSIM (status 1, not past its expiry) of an imported user. */
export function migrateEsim(row: LegacyEsimRow, now = new Date()): MigratedEsim | SkipReason {
  const expiresAt = validDate(row.expiry_date);
  if (Number(row.status) !== 1 || (expiresAt && expiresAt < now)) return "esim.not-active";
  const iccid = digits(row.iccid);
  if (!iccid) return "esim.no-iccid";
  const providerCode = text(row.provider_slug)?.toLowerCase();
  const providerPlanId = text(row.provider_plan_id);
  if (!providerCode) return "esim.no-provider";
  const activationCode = text(row.qr_code);
  const profileStatus = text(row.profile_status)?.toLowerCase() ?? null;
  return {
    legacyId: Number(row.id),
    userLegacyId: Number(row.user_id),
    providerCode,
    providerPlanId,
    planName: text(row.plan_name),
    iccid,
    simId: text(row.provider_sim_id) ?? text(row.serial_number),
    providerOrderId: text(row.purchase_id) ?? infoOrderNumber(row.info),
    activationCode,
    ...parseLpa(activationCode),
    expiresAt,
    activationDeadline: validDate(row.activation_deadline),
    profileStatus: profileStatus && PROFILE_STATUSES.has(profileStatus) ? (profileStatus as MigratedEsim["profileStatus"]) : null,
    remark: text(row.remark),
    createdAt: validDate(row.created_at) ?? now,
  };
}

const pin = (value: unknown) => {
  const code = text(value);
  return code && /^\d{4,10}$/.test(code) ? code : null;
};

/** Every number in the old stock: available ones stay for sale, sold ones go to their buyer. */
export function migrateNumber(row: LegacyNumberRow, now = new Date()): MigratedNumber | SkipReason {
  const iccid = (text(row.iccid) ?? "").replace(/[^0-9Ff]/g, "").toUpperCase();
  if (!/^\d{18,22}F?$/.test(iccid)) return "number.no-iccid";
  const dial = digits(text(row.dial_country_code));
  let msisdn = digits(text(row.msisdn)).replace(/^00/, "");
  if (dial && !(msisdn.startsWith(dial) && msisdn.length - dial.length >= 6)) msisdn = `${dial}${msisdn.replace(/^0+/, "")}`;
  if (!/^\d{5,17}$/.test(msisdn)) return "number.no-msisdn";
  const raw = text(row.lpa) ?? "";
  const body = raw.replace(/^LPA:1\$/i, "");
  if (!/^[A-Za-z0-9.-]+\$[A-Za-z0-9._-]+(\$.*)?$/.test(body)) return "number.no-lpa";
  const minor = (value: unknown) => {
    const amount = text(value);
    try {
      return amount ? decimalToMinor(amount) : 0;
    } catch {
      return 0;
    }
  };
  const sold = Number(row.status) === 1;
  return {
    legacyId: Number(row.id),
    iccid,
    msisdn,
    dialCode: dial,
    lpa: `LPA:1$${body}`,
    pin1: pin(row.pin1),
    puk1: pin(row.puk1),
    pin2: pin(row.pin2),
    puk2: pin(row.puk2),
    priceMinor: minor(row.price),
    premiumMinor: minor(row.premium_price),
    sold,
    userLegacyId: sold && Number(row.user_id) > 0 ? Number(row.user_id) : null,
    soldAt: sold ? (validDate(row.sold_at) ?? validDate(row.created_at) ?? now) : null,
    createdAt: validDate(row.created_at) ?? now,
  };
}

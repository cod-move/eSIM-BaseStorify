/**
 * Rows read from the old Laravel store (MIG) and what they become here —
 * pure, so the rules are tested without either database.
 *
 * Ported from the rewrite's importer (eSIM-Platform `legacy-mysql-import.ts`),
 * which ran against the live database on 2026-08-08 and reconciled to zero
 * differences: only email-verified users, Laravel bcrypt hashes kept as they
 * are (patch P16 upgrades them at first sign-in), status 1 active and anything
 * else banned. Here banned users are not imported at all, the whole
 * number-card stock is, and of the data eSIMs only those still in use (not
 * expired, not cancelled).
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
  balanceMinor: number;
  address: { country: string | null; city: string | null; state: string | null; postalCode: string | null; street: string | null };
  createdAt: Date;
  updatedAt: Date;
}

/** Why a row is left out; counted on the admin page, never listed with personal data. */
export type SkipReason =
  | "user.unverified"
  | "user.bad-email"
  | "user.bad-password"
  | "user.banned"
  | "number.no-iccid"
  | "number.no-msisdn"
  | "number.no-lpa"
  | "esim.not-data"
  | "esim.cancelled"
  | "esim.expired"
  | "esim.no-iccid";

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
  if (Number(row.status) !== 1) return "user.banned";
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

/** A data eSIM sold in the old store (`esims`), with its plan and supplier. */
export interface LegacyEsimRow {
  id: number;
  user_id: number | null;
  iccid: string | null;
  phone_number: string | null;
  qr_code: string | null;
  serial_number: string | null;
  provider_sim_id: string | null;
  /** JSON text (or already parsed): the supplier's ids — esimTranNo, order_num, license_cli, … */
  info: unknown;
  /** 1 active, 3 cancelled, else pending. */
  status: number;
  profile_status: string | null;
  expiry_date: Date | null;
  activation_deadline: Date | null;
  remark: string | null;
  created_at: Date | null;
  /** `esim_providers.slug`. */
  provider_slug: string | null;
  /** `plans.provider_plan_id` of the order line. */
  provider_plan_id: string | null;
  /** The old plan as it was sold, for a stand-in when the catalogue here has not got it. */
  plan_name?: string | null;
  /** Days. */
  plan_period?: number | string | null;
  /** Bytes; negative is unlimited. */
  plan_data_volume?: number | string | null;
  /** 1 total, 2 daily (slowed), 3 daily (cut off), 4 unlimited. */
  plan_data_type?: number | string | null;
  /** daypass_plan, total_plan, lifetime_plan, unlimited_plan. */
  plan_traffic_type?: string | null;
  order_number: string | null;
}

/** The old plan an eSIM was sold on, as far as the old store knew it. */
export interface LegacyPlanInfo {
  providerPlanId: string;
  name: string;
  validityDays: number;
  megabytes: number;
  dataType: "total" | "unlimited" | "daily_throttled" | "daily_cutoff" | "lifetime";
  label: string;
}

/** The plan id given to eSIMs whose old order line has no plan left. */
export const UNKNOWN_LEGACY_PLAN = "legacy-unknown";

export interface MigratedEsim {
  legacyId: number;
  userLegacyId: number | null;
  providerCode: string;
  providerPlanId: string;
  iccid: string;
  /** How the supplier is asked about it (lib/esim/providers/types.ts EsimRef). */
  providerEsimId: string | null;
  simId: string | null;
  activationCode: string | null;
  smdpAddress: string | null;
  matchingId: string | null;
  qrCodeUrl: string | null;
  expiresAt: Date | null;
  activationDeadline: Date | null;
  remark: string | null;
  orderNumber: string;
  createdAt: Date;
  legacyPlan: LegacyPlanInfo;
}

/** Old supplier slug → provider code here. TopConnect cards are the number import's. */
const DATA_PROVIDERS: Record<string, string> = {
  esimaccess: "esimaccess",
  stellar: "stellar",
  roamwifi: "roamwifi",
  bnesim: "bnesim",
  mobimatter: "mobimatter",
};

/** What the suppliers call an eSIM that can no longer be used. */
const ENDED_PROFILES = new Set(["USED_EXPIRED", "EXPIRED", "CANCEL", "CANCELED", "CANCELLED", "REVOKED", "DELETED", "TERMINATED", "CLOSED"]);

function infoOf(value: unknown): Record<string, unknown> {
  let parsed = value;
  if (typeof value === "string" || Buffer.isBuffer(value)) {
    try {
      parsed = JSON.parse(String(value));
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

/**
 * A data eSIM of the old store that is still in use: active, a supplier
 * served here, not past its expiry (or, never installed, its install
 * deadline), and not ended at the supplier. One with no expiry yet has not
 * started counting down: it is kept.
 */
export function migrateEsim(row: LegacyEsimRow, now = new Date()): MigratedEsim | SkipReason {
  const providerCode = DATA_PROVIDERS[(text(row.provider_slug) ?? "").toLowerCase()];
  if (!providerCode) return "esim.not-data";
  if (Number(row.status) !== 1) return "esim.cancelled";
  const expiresAt = validDate(row.expiry_date);
  const activationDeadline = validDate(row.activation_deadline);
  if (expiresAt && expiresAt.getTime() <= now.getTime()) return "esim.expired";
  if (!expiresAt && activationDeadline && activationDeadline.getTime() <= now.getTime()) return "esim.expired";
  if (ENDED_PROFILES.has((text(row.profile_status) ?? "").toUpperCase())) return "esim.expired";
  const iccid = (text(row.iccid) ?? "").replace(/[^0-9Ff]/g, "").toUpperCase();
  if (!/^\d{18,22}F?$/.test(iccid)) return "esim.no-iccid";
  // An order line whose plan is gone still gave a working eSIM: it is kept, with no plan here.
  const providerPlanId = text(row.provider_plan_id) ?? UNKNOWN_LEGACY_PLAN;

  const info = infoOf(row.info);
  const serial = text(row.serial_number);
  const ids: Record<string, { providerEsimId: string | null; simId: string | null }> = {
    esimaccess: { providerEsimId: text(info.esimTranNo), simId: null },
    stellar: { providerEsimId: text(info.stellar_esim_id), simId: text(row.provider_sim_id) ?? text(info.stellar_sim_id) ?? serial },
    roamwifi: { providerEsimId: text(info.order_num), simId: null },
    bnesim: { providerEsimId: iccid, simId: text(info.license_cli) },
    mobimatter: { providerEsimId: text(info.orderId) ?? text(info.order_id) ?? serial, simId: null },
  };

  const code = text(row.qr_code);
  // "LPA:1$smdp$code", or the bare "smdp$code" some suppliers hand out.
  const body = code ? code.replace(/^LPA:/i, "").replace(/^1\$/, "") : "";
  const lpa = /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}\$[^$\s]+(\$.*)?$/.test(body) ? `LPA:1$${body}` : null;
  const [, smdpAddress = null, matchingId = null] = lpa ? lpa.split("$") : [];
  const remark = text(row.remark);
  return {
    legacyId: Number(row.id),
    userLegacyId: Number(row.user_id) > 0 ? Number(row.user_id) : null,
    providerCode,
    providerPlanId,
    iccid,
    ...ids[providerCode],
    activationCode: lpa,
    smdpAddress: smdpAddress || null,
    matchingId: matchingId || null,
    qrCodeUrl: code && /^https?:\/\//i.test(code) ? code : null,
    expiresAt,
    activationDeadline,
    remark: remark ? remark.slice(0, 100) : null,
    orderNumber: `LEGACY-${text(row.order_number) ?? row.id}`.slice(0, 64),
    createdAt: validDate(row.created_at) ?? now,
    legacyPlan: legacyPlanInfo(row, providerPlanId),
  };
}

const MB = 1024 * 1024;

/** The old plan's name, days and data, read the way the old store showed them. */
export function legacyPlanInfo(row: LegacyEsimRow, providerPlanId: string): LegacyPlanInfo {
  const days = Math.max(0, Math.round(Number(row.plan_period) || 0));
  const bytes = Number(row.plan_data_volume);
  const dataKind = Number(row.plan_data_type);
  const traffic = (text(row.plan_traffic_type) ?? "").toLowerCase();
  const unlimited = (Number.isFinite(bytes) && bytes < 0) || dataKind === 4 || traffic === "unlimited_plan";
  const dataType: LegacyPlanInfo["dataType"] = unlimited
    ? "unlimited"
    : dataKind === 2
      ? "daily_throttled"
      : dataKind === 3 || traffic === "daypass_plan"
        ? "daily_cutoff"
        : traffic === "lifetime_plan"
          ? "lifetime"
          : "total";
  const megabytes = !unlimited && Number.isFinite(bytes) && bytes > 0 ? Math.round(bytes / MB) : 0;
  const label = unlimited
    ? "Unlimited"
    : megabytes >= 1024
      ? `${Math.round((megabytes / 1024) * 100) / 100} GB`
      : megabytes > 0
        ? `${megabytes} MB`
        : "";
  const name = text(row.plan_name) ?? (providerPlanId === UNKNOWN_LEGACY_PLAN ? "Old store plan" : providerPlanId);
  return { providerPlanId, name: name.slice(0, 200), validityDays: days, megabytes, dataType, label };
}

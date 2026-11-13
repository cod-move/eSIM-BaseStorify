/**
 * The shopper's eSIMs (the website's /account/esims, APP-03/04): the list,
 * one eSIM with its usage and how to install it, and asking the supplier for
 * fresh usage.
 *
 * GET /me/esims is the list, newest first; GET /me/esims/{id} one eSIM;
 * POST /me/esims/{id}/refresh reads its status and usage from the supplier
 * again (at most once a minute; a sooner ask answers with what is stored).
 *
 * `status` is one of `ESIM_STATUSES`; the app shows its own words for the
 * ones it knows and a neutral label for any other. Byte amounts come with the
 * text to print, as `Money` does: the app formats nothing.
 *
 * Not in the API's index: the eSIM module's own file (imported by path), so
 * the official contract is left as it is.
 */
import * as z from "zod";

import { Money } from "./common";

/** What the shopper sees an eSIM as (`EsimSummary.status`). */
export const ESIM_STATUSES = [
  /** The supplier is issuing it. */
  "issuing",
  /** It could not be issued; the order's settlement refunds it. */
  "failed",
  /** Issued and not on a phone yet. */
  "ready_to_install",
  /** On a phone, not used yet. */
  "installed",
  "in_use",
  "data_used_up",
  "expired",
  /** The eSIM lives on but has no plan running: a top-up starts one. */
  "no_active_package",
  "cancelled",
] as const;

/** How the status reads at a glance. */
export const EsimTone = z.enum(["neutral", "info", "success", "warning", "danger"]);
export type EsimTone = z.infer<typeof EsimTone>;

/** An amount of data, with the text to print. */
export const DataAmount = z.object({
  bytes: z.number(),
  formatted: z.string(),
});
export type DataAmount = z.infer<typeof DataAmount>;

export const EsimUsage = z.object({
  /** No allowance to measure against: only `used` is meaningful. */
  unlimited: z.boolean(),
  total: DataAmount,
  used: DataAmount,
  remaining: DataAmount,
  /** 0–100, left out when there is no allowance. */
  remainingPercent: z.number().optional(),
  /** When the supplier was last asked. */
  syncedAt: z.string().optional(),
  /** The supplier's last answer is old (it could not be reached since). */
  stale: z.boolean(),
});
export type EsimUsage = z.infer<typeof EsimUsage>;

export const EsimSummary = z.object({
  id: z.string(),
  /** The plan as sold: "Japan 5 GB · 7 days". */
  planName: z.string(),
  destination: z.string(),
  /** A flag or globe emoji, when the destination has one. */
  emoji: z.string().optional(),
  status: z.string(),
  tone: EsimTone,
  /** The shopper's own name for it. */
  remark: z.string().optional(),
  /** The last four digits, to tell eSIMs apart. */
  iccidEnd: z.string().optional(),
  usage: EsimUsage.optional(),
  expiresAt: z.string().optional(),
});
export type EsimSummary = z.infer<typeof EsimSummary>;

/** GET /me/esims */
export const EsimList = z.object({
  items: z.array(EsimSummary),
});
export type EsimList = z.infer<typeof EsimList>;

/**
 * How to put the eSIM on a phone. `iosLink` and `androidLink` open the
 * system's eSIM installer directly (iOS 17.4+, Android 10+ with Google's
 * installer); otherwise the shopper scans `qrImage` from another screen or
 * types the SM-DP+ address and activation code.
 */
export const EsimInstall = z.object({
  activationCode: z.string(),
  smdpAddress: z.string().optional(),
  matchingId: z.string().optional(),
  /** A PNG, as a data URL. */
  qrImage: z.string(),
  iosLink: z.string().optional(),
  androidLink: z.string().optional(),
  apn: z.string().optional(),
});
export type EsimInstall = z.infer<typeof EsimInstall>;

/** GET /me/esims/{id}, and the answer to POST /me/esims/{id}/refresh. */
export const EsimDetail = EsimSummary.extend({
  orderNumber: z.string(),
  iccid: z.string().optional(),
  /** The supplier's SIM id, sent only when there is no ICCID (Stellar masks it). */
  simId: z.string().optional(),
  /** The plan's allowance as sold: "5 GB", "Unlimited". */
  dataLabel: z.string(),
  validityDays: z.number(),
  fulfilledAt: z.string().optional(),
  /** Install before this, or the eSIM may lapse unused. */
  activationDeadline: z.string().optional(),
  /** before_expiry plans: last moment a top-up is taken. */
  topupDeadline: z.string().optional(),
  /** The status the shopper should act on: install it now. */
  canInstall: z.boolean(),
  canTopup: z.boolean(),
  /** Left out once the eSIM is cancelled or failed, or the supplier sent no code. */
  install: EsimInstall.optional(),
  /** The supplier's own page for this eSIM, when it has one. */
  supplierLink: z.string().optional(),
  /**
   * The shopper may cancel it (USR-07): not installed yet, on a refundable
   * plan. POST /me/esims/{id}/cancel; `refund` goes to the balance
   * (`toBalance`) or back to the payment, `fee` is kept.
   */
  cancellation: z.object({ refund: Money, fee: Money, toBalance: z.boolean() }).optional(),
});
export type EsimDetail = z.infer<typeof EsimDetail>;

/** POST /me/esims/{id}/cancel: nothing to send; the answer is the eSIM as it now is. */
export const EsimCancelInput = z.object({}).strict();
export type EsimCancelInput = z.infer<typeof EsimCancelInput>;

/** POST /me/esims/{id}/refresh: nothing to send. */
export const EsimRefreshInput = z.object({}).strict();
export type EsimRefreshInput = z.infer<typeof EsimRefreshInput>;

/*
 * Destinations and their plans (the website's /esim pages, APP-02).
 *
 * GET /esim/destinations is every destination an admin has put on sale, in
 * three lists; GET /esim/destinations/{scope}/{slug} one of them with its
 * plans, `scope` being `local` for a country and `multi` for a region or the
 * global plan. A plan is bought by adding its `productId` and `variantId` to
 * the cart (PUT /cart/lines); a day-priced plan sends the days chosen as
 * `lineAttributes.days`, between `perDay.minDays` and `perDay.maxDays`; a plan
 * with `startDate` may send the day it starts as `lineAttributes.activateOn`
 * (YYYY-MM-DD), between `startDate.min` and `startDate.max`. The cart prices
 * it: the app works out no price.
 */

export const EsimScope = z.enum(["local", "regional", "global"]);
export type EsimScope = z.infer<typeof EsimScope>;

export const EsimDestination = z.object({
  slug: z.string(),
  /** `local` or `multi`, for GET /esim/destinations/{scope}/{slug}. */
  pathScope: z.enum(["local", "multi"]),
  name: z.string(),
  emoji: z.string().optional(),
  scope: EsimScope,
  /** A country's continent: asia, europe, middle_east, north_america, south_america, oceania, africa or other. Left out for regions. */
  continent: z.string().optional(),
  /** ISO codes of the countries covered. */
  countries: z.array(z.string()),
  /** The cheapest plan, "from". Left out when every plan is day-priced. */
  fromPrice: Money.optional(),
  planCount: z.number().int(),
});
export type EsimDestination = z.infer<typeof EsimDestination>;

/** GET /esim/destinations */
export const EsimDestinationList = z.object({
  local: z.array(EsimDestination),
  regional: z.array(EsimDestination),
  global: z.array(EsimDestination),
});
export type EsimDestinationList = z.infer<typeof EsimDestinationList>;

export const EsimPlanOption = z.object({
  variantId: z.string(),
  name: z.string(),
  /** "5GB", "Unlimited (3GB/day high speed)", "1GB/day". */
  data: z.string(),
  dataType: z.string(),
  /** Fixed validity; left out for a day-priced plan. */
  days: z.number().int().optional(),
  /** The fixed plan's price; for a day-priced plan, the price of `perDay.minDays`. */
  price: Money,
  /** A day-priced plan: the shopper picks how many days. */
  perDay: z
    .object({
      minDays: z.number().int(),
      maxDays: z.number().int(),
      /** What one day adds, for "+ … a day". */
      pricePerDay: Money,
    })
    .optional(),
  /** stack: a top-up adds to it; addon: a separate package; none: no top-ups. */
  topupMode: z.string(),
  /** The shopper may pick the day it starts (UTC days, YYYY-MM-DD); left out when it starts as usual only. */
  startDate: z.object({ min: z.string(), max: z.string() }).optional(),
  /**
   * On a country's screen, a region's or the world's plan that covers it too:
   * the product it is bought as (the cart's `productId`) and the region's name.
   */
  productId: z.string().optional(),
  region: z.string().optional(),
  /** The operators it runs on, by name; left out when the supplier does not say. */
  operators: z.array(z.string()).optional(),
  /** Its values under each of the destination's `filters`, by the filter's `key`. */
  facets: z.record(z.string(), z.array(z.string())).optional(),
});
export type EsimPlanOption = z.infer<typeof EsimPlanOption>;

/** GET /esim/destinations/{scope}/{slug} */
export const EsimDestinationDetail = EsimDestination.extend({
  /** The store product the plans are variants of, for the cart. */
  productId: z.string(),
  /** The product's own page (`/products/{slug}`), with the full description. */
  productSlug: z.string(),
  image: z.string().optional(),
  countryNames: z.array(z.object({ code: z.string(), name: z.string() })),
  networks: z.array(z.object({ countryCode: z.string(), operator: z.string(), network: z.string().optional() })),
  plans: z.array(EsimPlanOption),
  /**
   * The website's plan filters (coverage, data type, days, data, top-up, exit
   * IP, operator), in order, each with two values or more. A plan shows under
   * a value when its `facets[key]` holds it; each filter offers what the other
   * chosen filters leave open.
   */
  filters: z
    .array(
      z.object({
        key: z.string(),
        title: z.string(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
    )
    .optional(),
});
export type EsimDestinationDetail = z.infer<typeof EsimDestinationDetail>;

/**
 * GET /esim/destinations/{scope}/{slug}/plans/{variantId}: one plan explained,
 * as the website's plan details: rows of a label and what it says (in the
 * shopper's language), and the countries it works in with their operators.
 */
export const EsimPlanDetails = z.object({
  variantId: z.string(),
  /** "5GB", as on the plan's card. */
  title: z.string(),
  /** "Total data", "Unlimited". */
  kind: z.string(),
  /** "7 days", "1–30 days". */
  days: z.string(),
  price: Money,
  rows: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      text: z.string(),
      /** More lines under the text (the top-up rules). */
      lines: z.array(z.string()).optional(),
      /** A warning under it. */
      note: z.string().optional(),
    }),
  ),
  coverage: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      operators: z.array(z.object({ operator: z.string(), network: z.string().optional() })),
    }),
  ),
});
export type EsimPlanDetails = z.infer<typeof EsimPlanDetails>;

/*
 * Top-ups (the website's /account/esims/{id}/topup, APP-06).
 *
 * GET /me/esims/{id}/topups is what the eSIM can take now, priced. POST
 * /me/esims/{id}/topups/quote fixes one for the cart: its answer is the line
 * to send to PUT /cart/lines as it is (`productId`, `variantId`, quantity 1,
 * `lineAttributes`). The quote is checked again at checkout.
 */

/** Why an eSIM takes no top-up (`EsimTopups.refusal`). */
export const ESIM_TOPUP_REFUSALS = [
  "not_supported",
  "not_issued",
  "cancelled",
  "expired",
  "used_up",
  "profile_expired",
] as const;

export const EsimTopupOffer = z.object({
  topupPlanId: z.string(),
  name: z.string(),
  /** "1 GB", "500 MB". */
  data: z.string(),
  validityDays: z.number().int(),
  price: Money,
});
export type EsimTopupOffer = z.infer<typeof EsimTopupOffer>;

/** GET /me/esims/{id}/topups */
export const EsimTopups = z.object({
  /** Left out when the eSIM can be topped up; one of `ESIM_TOPUP_REFUSALS` otherwise. */
  refusal: z.string().optional(),
  /** stack: added to the current plan; addon: a separate package beside it. */
  mode: z.enum(["stack", "addon"]).optional(),
  offers: z.array(EsimTopupOffer),
  /** The supplier could not be asked just now: try again shortly. */
  unavailable: z.boolean(),
});
export type EsimTopups = z.infer<typeof EsimTopups>;

/** POST /me/esims/{id}/topups/quote */
export const EsimTopupQuoteRequest = z.object({ topupPlanId: z.string().min(1).max(200) });
export type EsimTopupQuoteRequest = z.infer<typeof EsimTopupQuoteRequest>;

export const EsimTopupQuote = z.object({
  productId: z.string(),
  variantId: z.string(),
  lineAttributes: z.object({ topup: z.string() }),
  /** What the cart line will say, and cost. */
  label: z.string(),
  price: Money,
});
export type EsimTopupQuote = z.infer<typeof EsimTopupQuote>;

/*
 * Phones that take an eSIM (APP-05): GET /esim/devices, the website's device
 * table (the admin's, or the built-in list until the admin has one). A model
 * listed supports eSIM in general; where it was bought and its carrier lock
 * decide for one handset, which `note` and the app's caution say.
 */
export const EsimDeviceModel = z.object({
  name: z.string(),
  /** false: listed as not taking an eSIM. */
  supported: z.boolean(),
  note: z.string().optional(),
});
export type EsimDeviceModel = z.infer<typeof EsimDeviceModel>;

/** GET /esim/devices */
export const EsimDevices = z.object({
  brands: z.array(z.object({ brand: z.string(), models: z.array(EsimDeviceModel) })),
});
export type EsimDevices = z.infer<typeof EsimDevices>;

/*
 * Home blocks (APP-01), listed in `HOME_BLOCKS` (home.ts, patch P7): the
 * website's eSIM sections as the app draws them. The hero search, popular
 * destinations and the destination tabs become ESIM_DESTINATIONS; the device
 * check becomes ESIM_DEVICE_CHECK, a way to /esim/devices. An app that does
 * not know these types skips them.
 */
export const EsimDestinationsBlock = z.object({
  type: z.literal("ESIM_DESTINATIONS"),
  id: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  /** Set: draw a search box with these words, opening /esim. */
  searchPlaceholder: z.string().optional(),
  destinations: z.array(EsimDestination),
  showPrice: z.boolean(),
  /** The website's destination tabs: countries, regions, global, each its most popular. */
  tabs: z
    .array(z.object({ scope: EsimScope, label: z.string(), destinations: z.array(EsimDestination) }))
    .optional(),
});
export type EsimDestinationsBlock = z.infer<typeof EsimDestinationsBlock>;

export const EsimDeviceCheckBlock = z.object({
  type: z.literal("ESIM_DEVICE_CHECK"),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
});
export type EsimDeviceCheckBlock = z.infer<typeof EsimDeviceCheckBlock>;

/** "Need a phone number?": the way to the numbers on sale (NUM-03), a web page in the app. */
export const EsimNumbersEntryBlock = z.object({
  type: z.literal("ESIM_NUMBERS_ENTRY"),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  buttonLabel: z.string(),
  /** "12 numbers · from €5.00"; left out when the section hides prices. */
  summary: z.string().optional(),
  /** A few numbers on sale, "+44 7700 900123". */
  samples: z.array(z.string()),
  /** The website's path of the numbers page. */
  path: z.string(),
});
export type EsimNumbersEntryBlock = z.infer<typeof EsimNumbersEntryBlock>;

/*
 * The balance and referrals (the website's /account/esims/balance and
 * /account/esims/referrals, APP-07).
 *
 * GET /me/esim-wallet: the balance (the store credit eSIMs are paid with) and
 * how to add to it. Adding is a cart line: PUT /cart/lines with `product`
 * and `lineAttributes.wallet` the amount in cents, between `min` and `max`;
 * the cart adds the fee and says the total.
 *
 * GET /me/esim-referrals: the shopper's code and invite link, what a friend
 * gets, who joined and what it earned. PATCH /me/esim-referrals/code chooses
 * another code.
 */
export const EsimWallet = z.object({
  balance: Money,
  /** Adding money is switched on. */
  enabled: z.boolean(),
  min: Money,
  max: Money,
  /** Suggested amounts, between `min` and `max`. */
  presets: z.array(Money),
  fee: z.object({ fixed: Money, percent: z.number() }),
  /** The cart line's product, when adding money is on. */
  product: z.object({ productId: z.string(), variantId: z.string() }).optional(),
});
export type EsimWallet = z.infer<typeof EsimWallet>;

/** What a reward stands at (`EsimReferralReward.status`). */
export const ESIM_REWARD_STATUSES = ["pending", "credited", "cancelled"] as const;

export const EsimReferralReward = z.object({
  id: z.string(),
  orderNumber: z.string(),
  amount: Money,
  status: z.string(),
  /** pending: when it is added to the balance. */
  payableAt: z.string(),
  creditedAt: z.string().optional(),
});
export type EsimReferralReward = z.infer<typeof EsimReferralReward>;

const EsimRate = z.union([
  z.object({ kind: z.literal("percent"), percent: z.number() }),
  z.object({ kind: z.literal("fixed"), amount: Money }),
]);

/** GET /me/esim-referrals */
export const EsimReferrals = z.object({
  enabled: z.boolean(),
  code: z.string(),
  link: z.string(),
  offer: z.object({
    /** Earned per order of a friend: a percentage of it, or a fixed amount. */
    commission: EsimRate,
    /** Orders per friend that earn; 0 = every one. */
    orderLimit: z.number().int(),
    /** Days after the friend joins that orders earn; 0 = no end. */
    validityDays: z.number().int(),
    /** The friend's welcome discount, when there is one. */
    friendDiscount: EsimRate.optional(),
  }),
  invited: z.array(z.object({ id: z.string(), who: z.string(), joinedAt: z.string(), rewards: Money })),
  rewards: z.array(EsimReferralReward),
  totals: z.object({ credited: Money, pending: Money }),
});
export type EsimReferrals = z.infer<typeof EsimReferrals>;

/** PATCH /me/esim-referrals/code */
export const EsimReferralCodeRequest = z.object({ code: z.string().trim().min(1).max(40) });
export type EsimReferralCodeRequest = z.infer<typeof EsimReferralCodeRequest>;

export const EsimReferralCode = z.object({ code: z.string(), link: z.string() });
export type EsimReferralCode = z.infer<typeof EsimReferralCode>;

/*
 * Identity verification (the website's /account/esims/verification, APP-07).
 *
 * GET /me/esim-kyc: where the shopper stands and the form to fill in. A file
 * question is answered in two steps, as the app sends one file per request:
 * POST /me/esim-kyc/files (multipart: the file in `file`, the question's key
 * in `field`) stores it privately and answers its `id`; POST /me/esim-kyc
 * then sends the answers, with `files` naming those ids by question. An id is
 * good for a day and only for this shopper.
 *
 * Refusals: 422 VALIDATION_ERROR with `errors` by question key.
 */
export const ESIM_KYC_STATUSES = ["none", "pending", "approved", "rejected"] as const;
export const ESIM_KYC_FIELD_TYPES = ["text", "textarea", "select", "date", "file"] as const;

export const EsimKycField = z.object({
  key: z.string(),
  label: z.string(),
  /** One of `ESIM_KYC_FIELD_TYPES`; a type the app does not know is shown as text. */
  type: z.string(),
  required: z.boolean(),
  /** select only. */
  options: z.array(z.string()),
  help: z.string().optional(),
});
export type EsimKycField = z.infer<typeof EsimKycField>;

/** GET /me/esim-kyc */
export const EsimKyc = z.object({
  status: z.string(),
  /** rejected: why. */
  reason: z.string().optional(),
  submittedAt: z.string().optional(),
  /** Left out when verification is not open yet. */
  form: z.object({ version: z.number().int(), fields: z.array(EsimKycField) }).optional(),
  /** Files can be stored; without it, file questions cannot be answered yet. */
  uploadsReady: z.boolean(),
  fileTypes: z.array(z.string()),
  maxFileBytes: z.number().int(),
});
export type EsimKyc = z.infer<typeof EsimKyc>;

/** POST /me/esim-kyc/files */
export const EsimKycFile = z.object({ id: z.string(), name: z.string() });
export type EsimKycFile = z.infer<typeof EsimKycFile>;

/** POST /me/esim-kyc */
export const EsimKycSubmitRequest = z.object({
  values: z.record(z.string().max(64), z.string().max(2000)),
  /** Question key → `EsimKycFile.id`. */
  files: z.record(z.string().max(64), z.string().max(64)),
});
export type EsimKycSubmitRequest = z.infer<typeof EsimKycSubmitRequest>;

// ── Phone numbers (TopConnect number cards, NUM-03~09) ─────────────────────
//
// GET /esim/numbers is the numbers page: anyone may browse. Buying needs a
// signed-in shopper: POST /me/esim-numbers/quote checks the choice and
// answers with the cart line to send as it is (the cart prices it again and
// holds the number once checkout starts). The shopper's own numbers are under
// /me/esim-numbers: the list, one number with its card (balance, packages,
// install details), its top-ups (POST …/topups/quote, a cart line as well),
// its services, history, diagnostics and the manage actions.
//
// Every number amount is in the card's currency (TopConnect's, euros), as
// `Money`; checkout charges its USD equivalent at the day's rate plus the FX
// buffer (`usdPerUnit` carries both, for showing what checkout will charge).
// A refused action answers 409 CONFLICT with one of `ESIM_NUMBER_REASONS`
// when the store knows why, and its English sentence otherwise.

/** Why a number action was refused (`reason` of a 409). */
export const ESIM_NUMBER_REASONS = [
  "SIGN_IN",
  "NUMBER_TAKEN",
  "PACKET_GONE",
  "NOT_PRICED",
  "BAD_AMOUNT",
  "BLOCKED",
  "UNAVAILABLE",
  "NETWORK_FAILED",
  "BAD_NUMBER",
  "SAME_NUMBER",
  "NOT_PLATFORM_NUMBER",
  "CURRENCY_MISMATCH",
  "NOT_ENOUGH_CREDIT",
  "TRANSFER_OPEN",
  "REFRESH_RETRY",
  "QR_OPEN",
  "RECONNECT_WAIT",
  "RECONNECT_UNSUPPORTED",
  "DATA_STAYS_ON",
  "BAD_LIMIT",
  "PACKET_NOT_ON_CARD",
  "NO_ACCOUNT",
  "SAME_ACCOUNT",
  "CONFIRM_MISMATCH",
  "TOO_MANY_TRIES",
  "REFUSED",
] as const;
export type EsimNumberReason = (typeof ESIM_NUMBER_REASONS)[number];

/** GET /esim/numbers — `code` a country calling code, `digits` digits the number contains. */
export const EsimNumberShopQuery = z.object({
  code: z.string().regex(/^\d{1,4}$/).optional(),
  digits: z.string().regex(/^\d{1,12}$/).optional(),
  premium: z.enum(["all", "standard", "premium"]).optional(),
  page: z.number().int().min(1).max(10_000).optional(),
});
export type EsimNumberShopQuery = z.infer<typeof EsimNumberShopQuery>;

/** A number on sale. `price` is the number with its premium. */
export const EsimNumberOnSale = z.object({
  id: z.string(),
  dialCode: z.string(),
  nationalNumber: z.string(),
  /** "+372 5550 1234". */
  display: z.string(),
  country: z.string().optional(),
  numberPrice: Money,
  /** The memorable-number premium, when there is one. */
  premium: Money.optional(),
  price: Money,
});
export type EsimNumberOnSale = z.infer<typeof EsimNumberOnSale>;

/** A data package for a number. */
export const EsimNumberPacket = z.object({
  id: z.string(),
  name: z.string(),
  /** "5 GB", or the word for unlimited. */
  volume: z.string(),
  validityDays: z.number().int(),
  price: Money,
  perGb: Money.optional(),
});
export type EsimNumberPacket = z.infer<typeof EsimNumberPacket>;

/** Packages that cover the same countries, named in the shopper's language. */
export const EsimNumberPacketGroup = z.object({
  key: z.string(),
  countries: z.array(z.object({ code: z.string(), name: z.string() })),
  packets: z.array(EsimNumberPacket),
});
export type EsimNumberPacketGroup = z.infer<typeof EsimNumberPacketGroup>;

/**
 * The credit that can be put on a number: whole amounts from `min` to `max`,
 * in cents of `currency`. `usdPerUnit` is null while the currency cannot be
 * priced (credit cannot be bought then).
 */
export const EsimNumberRecharge = z.object({
  currency: z.string(),
  minMinor: z.number().int(),
  maxMinor: z.number().int(),
  presetMinor: z.number().int(),
  min: Money,
  max: Money,
  suggestions: z.array(z.object({ minor: z.number().int(), money: Money })),
  usdPerUnit: z.number().nullable(),
});
export type EsimNumberRecharge = z.infer<typeof EsimNumberRecharge>;

export const EsimNumberShop = z.object({
  items: z.array(EsimNumberOnSale),
  total: z.number().int(),
  page: z.number().int(),
  pages: z.number().int(),
  dialCodes: z.array(z.object({ code: z.string(), country: z.string().optional(), count: z.number().int() })),
  packetGroups: z.array(EsimNumberPacketGroup),
  recharge: EsimNumberRecharge,
  /** False until the store sells numbers: browsing works, buying does not. */
  buyable: z.boolean(),
  /** The service and account risks a buyer accepts first, in order. */
  risks: z.array(z.string()),
  /** How long checkout holds a number for the shopper. */
  holdMinutes: z.number().int(),
});
export type EsimNumberShop = z.infer<typeof EsimNumberShop>;

/**
 * GET /esim/numbers/price — what a choice comes to: a number (`id`) with its
 * credit and package, or (no `id`) credit or a package alone, for a top-up.
 * `recharge` in cents of the card currency.
 */
export const EsimNumberPriceQuery = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  recharge: z.number().int().min(0).max(10_000_000).optional(),
  packet: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});
export type EsimNumberPriceQuery = z.infer<typeof EsimNumberPriceQuery>;

/** `total` in the card currency; `charged` what checkout takes for it (left out while it cannot be priced). */
export const EsimNumberPrice = z.object({ total: Money, charged: Money.optional() });
export type EsimNumberPrice = z.infer<typeof EsimNumberPrice>;

/** POST /me/esim-numbers/quote — `recharge` in cents of the card currency. */
export const EsimNumberQuoteRequest = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i),
  recharge: z.number().int().min(1).max(10_000_000),
  packet: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});
export type EsimNumberQuoteRequest = z.infer<typeof EsimNumberQuoteRequest>;

/** POST /me/esim-numbers/{id}/topups/quote — credit or a package, not both. */
export const EsimNumberTopupQuoteRequest = z.object({
  recharge: z.number().int().min(1).max(10_000_000).optional(),
  packet: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});
export type EsimNumberTopupQuoteRequest = z.infer<typeof EsimNumberTopupQuoteRequest>;

/** The cart line to send as it is; `price` is what checkout charges now. */
export const EsimNumberQuote = z.object({
  productId: z.string(),
  variantId: z.string(),
  lineAttributes: z.record(z.string(), z.unknown()),
  label: z.string(),
  price: Money,
});
export type EsimNumberQuote = z.infer<typeof EsimNumberQuote>;

export const EsimNumberSummary = z.object({
  id: z.string(),
  msisdn: z.string(),
  display: z.string(),
  country: z.string().optional(),
  remark: z.string().optional(),
  /** Null while the network has not said. */
  blocked: z.boolean().nullable(),
  balance: Money.optional(),
  lastUsedAt: z.string().optional(),
  /** A number stays the shopper's for a year after it was last used. */
  validUntil: z.string().optional(),
});
export type EsimNumberSummary = z.infer<typeof EsimNumberSummary>;

/** GET /me/esim-numbers */
export const EsimNumberList = z.object({ items: z.array(EsimNumberSummary) });
export type EsimNumberList = z.infer<typeof EsimNumberList>;

/** A data package on the card. `packetId` set: it can be cancelled. */
export const EsimNumberCardPackage = z.object({
  name: z.string(),
  packetId: z.string().optional(),
  /** Bought and waiting for the next data session. */
  ordered: z.boolean(),
  total: z.string().optional(),
  left: z.string().optional(),
  leftPercent: z.number().optional(),
  expiresAt: z.string().optional(),
});
export type EsimNumberCardPackage = z.infer<typeof EsimNumberCardPackage>;

export const EsimNumberInstall = z.object({
  lpa: z.string(),
  qrImage: z.string(),
  smdpAddress: z.string().optional(),
  matchingId: z.string().optional(),
  iosLink: z.string().optional(),
  androidLink: z.string().optional(),
  pin1: z.string().optional(),
  puk1: z.string().optional(),
  pin2: z.string().optional(),
  puk2: z.string().optional(),
});
export type EsimNumberInstall = z.infer<typeof EsimNumberInstall>;

/** GET /me/esim-numbers/{id}: read from TopConnect as it opens (at most once a minute). */
export const EsimNumberDetail = EsimNumberSummary.extend({
  iccid: z.string(),
  orderNumber: z.string().optional(),
  /** The card currency: every amount on this number is in it. */
  currency: z.string(),
  /** When the network last answered; null before it ever has. */
  checkedAt: z.string().nullable(),
  /** The last read failed: what is shown is from `checkedAt`. */
  stale: z.boolean(),
  /** The balance in cents, for checking a transfer against it. */
  balanceMinor: z.number().int().nullable(),
  packages: z.array(EsimNumberCardPackage),
  /** Paid for and still being put on the number, worded for the shopper. */
  pending: z.array(z.string()),
  install: EsimNumberInstall.optional(),
  /** What can be bought for it; `buyable` false when not now. */
  topups: z.object({ buyable: z.boolean(), recharge: EsimNumberRecharge, packetGroups: z.array(EsimNumberPacketGroup) }),
  /** The shopper's other numbers, offered as transfer targets. */
  transferTargets: z.array(z.object({ msisdn: z.string(), title: z.string() })),
  /** A new QR code: whether it can be asked for, its fee, the latest request. */
  qr: z.object({
    enabled: z.boolean(),
    fee: Money,
    latest: z.object({ state: z.string(), createdAt: z.string(), note: z.string().optional() }).optional(),
  }),
  /** The sender "SMS to myself" starts with. */
  smsSender: z.string(),
  smsMaxChars: z.number().int(),
});
export type EsimNumberDetail = z.infer<typeof EsimNumberDetail>;

/** PATCH /me/esim-numbers/{id} — the shopper's own name for it; empty clears it. */
export const EsimNumberRemarkRequest = z.object({ remark: z.string().max(100) });
export const EsimNumberRemark = z.object({ remark: z.string().nullable() });
export type EsimNumberRemark = z.infer<typeof EsimNumberRemark>;

/** POST /me/esim-numbers/{id}/refresh, /packets/cancel: the number as it now is. */
export const EsimNumberRefreshRequest = z.object({});
export const EsimNumberPacketCancelRequest = z.object({ packetId: z.string().regex(/^\d{1,9}$/) });

/** The switches on a number. */
export const ESIM_NUMBER_SWITCHES = ["data", "sms", "voice", "voicemail"] as const;
export type EsimNumberSwitch = (typeof ESIM_NUMBER_SWITCHES)[number];

/** GET /me/esim-numbers/{id}/services — null where the network did not say. */
export const EsimNumberServices = z.object({
  data: z.boolean().nullable(),
  sms: z.boolean().nullable(),
  voice: z.boolean().nullable(),
  voicemail: z.boolean().nullable(),
  /** Digits with the country code; null when calls are not forwarded; left out when unknown. */
  forwardTo: z.string().nullable().optional(),
  forwardKnown: z.boolean(),
  blocked: z.boolean(),
});
export type EsimNumberServices = z.infer<typeof EsimNumberServices>;

/** POST /me/esim-numbers/{id}/services */
export const EsimNumberSwitchRequest = z.object({ service: z.enum(ESIM_NUMBER_SWITCHES), on: z.boolean() });
export const EsimNumberSwitchResult = z.object({ service: z.enum(ESIM_NUMBER_SWITCHES), on: z.boolean() });
export type EsimNumberSwitchResult = z.infer<typeof EsimNumberSwitchResult>;

/** POST /me/esim-numbers/{id}/forward — `to` null stops forwarding. */
export const EsimNumberForwardRequest = z.object({ to: z.string().trim().max(24).nullable() });
export const EsimNumberForward = z.object({ forwardTo: z.string().nullable() });
export type EsimNumberForward = z.infer<typeof EsimNumberForward>;

/** A daily data spending limit, in the card currency. */
export const EsimNumberDataLimit = z.object({
  /** False when the network did not answer. */
  known: z.boolean(),
  limit: z
    .object({
      value: Money.optional(),
      valueMinor: z.number().int().optional(),
      used: Money.optional(),
      periodEnd: z.string().optional(),
    })
    .nullable(),
  minMinor: z.number().int(),
  maxMinor: z.number().int(),
});
export type EsimNumberDataLimit = z.infer<typeof EsimNumberDataLimit>;

/** POST /me/esim-numbers/{id}/data-limit — `valueMinor` null removes the limit. */
export const EsimNumberDataLimitRequest = z.object({ valueMinor: z.number().int().nullable() });

export const ESIM_NUMBER_HISTORY_DAYS = [7, 30, 90] as const;

/** GET /me/esim-numbers/{id}/history?days=7|30|90 — each list null when the network did not answer for it. */
export const EsimNumberHistoryQuery = z.object({ days: z.number().int().optional() });
export const EsimNumberHistory = z.object({
  days: z.number().int(),
  totals: z.object({ calls: z.number().int(), texts: z.number().int(), data: z.string(), cost: Money }),
  calls: z
    .array(
      z.object({
        kind: z.enum(["call", "sms", "voicemail"]),
        direction: z.enum(["in", "out"]).nullable(),
        /** The other party, digits with the country code. */
        party: z.string().optional(),
        at: z.string().optional(),
        duration: z.string().optional(),
        destination: z.string().optional(),
        cost: Money.optional(),
      }),
    )
    .nullable(),
  data: z
    .array(z.object({ at: z.string().optional(), network: z.string().optional(), traffic: z.string(), cost: Money.optional() }))
    .nullable(),
  recharges: z
    .array(z.object({ at: z.string().optional(), kind: z.enum(["voucher", "transfer", "automatic", "web"]), out: z.boolean(), amount: Money.optional() }))
    .nullable(),
  voicemails: z.array(z.object({ id: z.string(), at: z.string().optional(), from: z.string().optional() })).nullable(),
});
export type EsimNumberHistory = z.infer<typeof EsimNumberHistory>;

/** GET /me/esim-numbers/{id}/diagnostics — what the network last saw. */
export const EsimNumberDiagnostics = z.object({
  /** Null when the network did not answer for the list. */
  activity: z
    .array(
      z.object({
        type: z.string(),
        at: z.string().optional(),
        detail: z.string().optional(),
        cost: Money.optional(),
      }),
    )
    .nullable(),
  /** The latest registration; left out when unknown, null when there is none yet. */
  location: z.object({ at: z.string().optional(), network: z.string() }).nullable().optional(),
  locationKnown: z.boolean(),
  /** The open data session; null when none; left out when unknown. */
  session: z.object({ startedAt: z.string().optional(), network: z.string().optional() }).nullable().optional(),
  sessionKnown: z.boolean(),
  /** Reconnected recently: not again before this. */
  reconnectAfter: z.string().optional(),
  /** False when this SIM cannot be reconnected remotely; null when unknown. */
  reconnectSupported: z.boolean().nullable(),
});
export type EsimNumberDiagnostics = z.infer<typeof EsimNumberDiagnostics>;

/** POST /me/esim-numbers/{id}/reconnect */
export const EsimNumberReconnect = z.object({ reconnectAfter: z.string() });
export type EsimNumberReconnect = z.infer<typeof EsimNumberReconnect>;

/** POST /me/esim-numbers/{id}/sms — a text to the number itself, to check it receives. */
export const EsimNumberSmsRequest = z.object({
  from: z.string().trim().regex(/^\+?\d{3,15}$/),
  message: z.string().trim().min(1).max(640),
});

/** POST /me/esim-numbers/{id}/transfer — credit to another of the platform's numbers; once per `key`. */
export const EsimNumberTransferRequest = z.object({
  to: z.string().trim().regex(/^\+?[\d\s()-]{6,24}$/),
  amountMinor: z.number().int().min(1).max(10_000_000),
  key: z.string().trim().min(8).max(100),
});

/** POST /me/esim-numbers/{id}/qr, /owner, /release — each once per `key`. */
export const EsimNumberQrRequest = z.object({ key: z.string().trim().min(8).max(80) });
export const EsimNumberOwnerRequest = z.object({ email: z.string().trim().email().max(200), key: z.string().trim().min(8).max(80) });
export const EsimNumberReleaseRequest = z.object({ confirm: z.string().trim().max(24), key: z.string().trim().min(8).max(80) });

/** POST /me/esim-numbers/{id}/voucher — a recharge voucher's PIN. */
export const EsimNumberVoucherRequest = z.object({ pin: z.string().trim().min(6).max(40) });

/**
 * What an action did. `state` "completed" when done; otherwise it is being
 * carried out (`message` says so, in English when the app has no words).
 */
export const EsimNumberActionResult = z.object({ state: z.string(), message: z.string().optional() });
export type EsimNumberActionResult = z.infer<typeof EsimNumberActionResult>;

/** GET /me/esim-numbers/{id}/statement?from=YYYY-MM&to=YYYY-MM — the phone bill, a PDF. */
export const EsimNumberStatementQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}$/),
});
export const EsimNumberStatement = z.object({ fileName: z.string(), pdfBase64: z.string() });
export type EsimNumberStatement = z.infer<typeof EsimNumberStatement>;

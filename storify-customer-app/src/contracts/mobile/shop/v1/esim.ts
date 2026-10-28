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
});
export type EsimDetail = z.infer<typeof EsimDetail>;

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
 * `lineAttributes.days`, between `perDay.minDays` and `perDay.maxDays`. The
 * cart prices it: the app works out no price.
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
});
export type EsimDestinationDetail = z.infer<typeof EsimDestinationDetail>;

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
});
export type EsimDestinationsBlock = z.infer<typeof EsimDestinationsBlock>;

export const EsimDeviceCheckBlock = z.object({
  type: z.literal("ESIM_DEVICE_CHECK"),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
});
export type EsimDeviceCheckBlock = z.infer<typeof EsimDeviceCheckBlock>;

# eSIM module

Everything eSIM-specific lives here and in the files named below; official Storify files change only at the patch points in `UPSTREAM-PATCHES.md`.

| Path | What |
|---|---|
| `providers/types.ts` | The adapter contract; shapes follow Stellar's wholesale API |
| `providers/{stellar,esim-access,roamwifi,bnesim,mobimatter}.ts` | One adapter per supplier; pure TS, no database. BNESIM buys in stages (license → eSIM → card), each stored before the next, and its top-ups are flagged `nonIdempotent` so an unclear answer stops for a person. MobiMatter creates an order (nothing charged) and completes it from `queryPurchase` / `queryTopup` only while it is still "created", so a retry never pays twice |
| `providers/registry.ts` | Supplier code → adapter, credential keys, which keys are secret |
| `provider-service.ts` | Supplier record → working adapter; encrypts/decrypts credentials |
| `catalog/sync.ts` | Supplier catalogue → `EsimPlan` (CAT-03) |
| `provider-log.ts`, `redact.ts` | Redacted log of every supplier call |
| `models/esim-*.model.ts` | `EsimProvider`, `EsimPlan`, `EsimProviderLog` |
| `app/api/cron/esim-catalog` | Scheduled catalogue sync (CRON_SECRET) |
| `scripts/esim-provider.ts` | CLI: set / probe / sync suppliers until the admin pages exist |
| `pricing/fx.ts`, `pricing/fx-service.ts` | ECB daily rates crossed to USD, manual overrides, history (CAT-08) |
| `pricing/price.ts`, `pricing/reprice.ts` | Cost → USD selling price: buffer, layered markup rules, margin floor, rounding (CAT-07) |
| `catalog/variants.ts`, `catalog/publish.ts` | Plans → one Storify product per destination, one variant per bundle with primary/fallback suppliers (CAT-05/06) |
| `models/esim-{fx-rate,pricing,product-link}.model.ts` | Rates, pricing rules + settings, product/variant ↔ plan links |
| `scripts/esim-catalog.ts` | CLI: fx, settings, rules, reprice, plans activate, publish |

| `fulfillment/policy.ts` | Retry / failover / poll decisions after each supplier answer (pure) |
| `fulfillment/service.ts` | Paid order → one job per eSIM unit; claims, buys, records `EsimProfile` + base `EsimPackage` |
| `fulfillment/delivery.ts` | Delivery email (QR attached, manual + one-tap install), eSIM-only orders → delivered; failures → admins + "delayed" email |
| `fulfillment/index.ts` | `esimQueueOrder` / `esimFulfilOrder` (called from payment settlement, patch P3) and the cron runner |
| `models/esim-{profile,package,fulfillment}.model.ts` | eSIM, its packages, fulfilment jobs |
| `app/api/cron/esim-fulfillment` | Every minute: due retries and polls, plus paid orders never queued |
| `providers/fake.ts` | Testing supplier (fulfil / pending / reject / uncertain), only with `ESIM_ENABLE_FAKE_PROVIDER=true` |
| `scripts/esim-dev-fulfilment.ts` | End-to-end fulfilment check with fake suppliers; cleans up after itself |
| `fulfillment/refund.ts`, `fulfillment/refund-amount.ts` | eSIMs every supplier failed → store credit, following the admin route's refund steps |
| `cart/line-attributes.ts` | A line's `lineAttributes` (patch P10): parse, check against the variant, price per day, name the days (pure) |
| `cart/index.ts` | What Storify's cart and checkout call: `esimCartLine` (add), `esimLinePrices` (checkout re-pricing), `withLineDays` (order line variant) |
| `components/esim/esim-day-picker.tsx`, `app/api/esim/catalog/products/[id]/day-pricing` | Days picker in the product page's buy box, for a day-priced variant only |
| `scripts/esim-dev-days.ts` | End-to-end check of a day-priced plan: publish → cart → re-price → order → fulfil; cleans up and reports leftovers |

| `storefront/catalog.ts` | Published, active destinations with their variants for the destination pages; 5-minute cache tagged `esim-storefront` (publishing clears it) |
| `storefront/selector.ts`, `storefront/continents.ts` | Plan selector steps (days → data → top-up → exit IP) and continent grouping (pure) |
| `app/[locale]/(store)/esim/` | `/esim` overview, `/esim/<country>`, `/esim/region/<slug>`, `/esim/global`; in the sitemap via patch P17 |
| `components/esim/{destination-browser,destination-page,plan-selector}.tsx` | Overview search and tabs; a destination's page; the selector that adds straight to the cart |

| `storefront/sections/` | Page-builder blocks `esim-*` (search hero, popular, tabs, plan selector, steps, install guide, device check); registered by patch P1 |
| `storefront/theme.ts` | The "eSIM Travel" theme (id `esim-travel`): tokens and a home page of eSIM blocks; registered by patch P2 |
| `storefront/devices.ts` | Built-in eSIM phone list for the device check, until the admin's device table exists |
| `i18n/messages.ts`, `locales/esim/{en,zh}.json` | eSIM texts, block names and field labels, merged under Storify's messages by patch P9 |

| `admin/{providers,plans,pricing}.ts` | Admin services: suppliers (credentials, test, sync), plan library (filters, bulk on/off, hand-set price, publish), pricing settings/rules with preview, exchange rates |
| `app/[locale]/admin/esim/`, `app/api/esim/admin/` | Admin pages Plans, Pricing, Suppliers and their API; access via the team permissions `view_esim` / `manage_esim` (patch P6), menu via patch P5; every change is audit-logged as a "settings" change with an `esim:` id |

| `admin/{esims,queue,logs}.ts` | Admin operations: eSIM list and detail (refresh usage, resend email, cancel at supplier), the problem queue, supplier call logs |
| `fulfillment/service.ts` (`adminRetryJob`, `adminFailJob`, `adminMarkRefunded`, `adminBindEsim`) | Queue actions: retry or another supplier (refused while the current one may still deliver), give up and refund, a guest refund made by hand, bind an eSIM bought by hand by its ICCID |
| `scripts/esim-dev-ops.ts` | End-to-end check of the queue actions with fake suppliers; cleans up and reports leftovers |

| `admin/{jobs,cron-config}.ts`, `app/api/cron/esim-fx` | Scheduled jobs page (status from Storify's `CronRun`, run now); schedules in `vercel.json` and the stale-job alert via patch P18 |
| `admin/destinations.ts`, `models/esim-destination.model.ts` | Destinations (feature, show/hide, all plans on/off, publish) and the variant ↔ supplier mapping with a pinned primary that publishing honours |
| `admin/devices.ts`, `models/esim-device.model.ts` | The device-compatibility list kept in the admin; the storefront uses the built-in list until it has rows |
| `scripts/esim-dev-admin2.ts` | End-to-end check of jobs, destinations, pinning and devices; cleans up and reports leftovers |

| `storefront/product-facts.ts`, `storefront/sections/product.tsx` | Product-page block `esim-product-details` (WEB-34): coverage, networks, speed, data type, activation, hotspot, top-up, extras — in the eSIM theme's product page |
| `admin/help-pages.ts`, `scripts/esim-dev-help-pages.ts` | The help pages `/pages/esim-compatibility` and `/pages/esim-install` (WEB-35), created from Admin → eSIM → Devices |

| `topup/eligibility.ts` | Whether an eSIM can be topped up now (TOP-01): before_expiry / while_profile_exists (pure) |
| `topup/offers.ts`, `app/api/esim/me/esims/[id]/topup` | The supplier's top-ups for an eSIM, priced by the pricing rules (TOP-02); a chosen one becomes an `EsimTopupQuote` (TOP-03) |
| `topup/product.ts` | The hidden "eSIM Top-up" store product: active, not on the online store, so only the cart and checkout see it |
| `cart/index.ts` (top-up lines) | A top-up line carries `lineAttributes.topup` (the quote) — signed-in owner only, one unit, priced from the quote; checkout refuses an invalid one |
| `topup/service.ts`, `models/esim-topup.model.ts` | Paid order → one job per top-up line; tried at the eSIM's own supplier with key `provider-topup:{id}`, polled while processing; stack adds to the base package, addon adds one (TOP-04/05); admin retry / give up / refunded by hand |
| `fulfillment/refund.ts`, `fulfillment/delivery.ts` | Failed top-ups are refunded with the order's failed eSIMs (TOP-07); completed ones are emailed; all-digital orders close as delivered |
| `app/[locale]/(store)/account/esims/[id]/topup`, `topup/history.ts` | The shopper's top-up page and the eSIM's top-up history (TOP-06) |
| `admin/topups.ts`, `app/[locale]/admin/esim/topups` | Admin → eSIM → Top-ups: by status, shopper (email), supplier and date, with the actions (TOP-06) |
| `scripts/esim-dev-topup.ts` | End-to-end check of top-ups with fake suppliers; cleans up and reports leftovers |

| `usage/sync.ts`, `app/api/cron/esim-usage` | Every 30 minutes: live eSIMs' usage and status from their suppliers (hourly in use, 3-hourly installed, twice a day waiting), then the reminders due |
| `reminders/policy.ts`, `reminders/send.ts` | Shopper reminders, each once: connected (NTF-03), low data with a top-up link (NTF-04, again after a top-up), plan ending (NTF-05), install-by (NTF-07); email, plus an in-app notice for registered shoppers |
| `admin/reminders.ts`, `components/esim/admin/reminders-card.tsx` | Reminders on/off and thresholds, on Admin → eSIM → Scheduled jobs |
| `alerts.ts` | Admin alerts (NTF-09), once per supplier, kind and day: catalogue sync failed, usage checks failing, a refusal that reads like an empty balance |
| `scripts/esim-dev-reminders.ts` | End-to-end check of the sync and reminders on the script's own eSIMs; cleans up and reports leftovers |

| `wallet/booking.ts` | Wallet top-ups (WAL-01): the fee, and how much of a paid top-up line is balance — read by the ledger and the refund ceiling (patch P19) and the credit (pure) |
| `wallet/product.ts`, `catalog/hidden-product.ts` | The hidden "Wallet top-up" product (and the top-up product), made by the catalogue publish |
| `cart/index.ts` (wallet lines) | `lineAttributes.wallet` (cents): signed-in only, within the set amounts, one unit, alone in the cart; priced as amount + fee |
| `wallet/credit.ts` | Paid → one store-credit lot, source `wallet_topup` (patch P12), once per order; the order is delivered |
| `app/[locale]/(store)/account/esims/balance`, `components/esim/wallet-topup-form.tsx` | The shopper's balance and Add money (amount, fee, what is paid) |
| `admin/wallet.ts`, `components/esim/admin/wallet-settings-card.tsx` | Wallet top-up on/off, amounts and fee, on Admin → eSIM → Pricing |
| `scripts/esim-dev-wallet.ts` | End-to-end check: cart, checkout, booking through Storify's posting rules, refund ceiling, credit once |

| `referral/rules.ts` | Referral codes, the commission (percent or fixed), what an order earns on (paid less refunds and wallet top-ups), validity and order limit (pure) |
| `referral/service.ts`, `app/[locale]/(store)/esim/invite/[code]` | Codes (made on first ask, changeable), the invite link's 30-day cookie, recording the referral at sign-up (patch P14) and the friend's one-use welcome coupon (REF-01/06) |
| `referral/commission.ts`, `models/esim-referral.model.ts` | A commission per delivered referred order; paid as store credit (`goodwill`, a promotion) after the holding period by the usage cron; refunded during the hold → cancelled, after → marked to take back by hand (REF-02..04) |
| `referral/centre.ts`, `app/[locale]/(store)/account/esims/referrals` | The shopper's referral centre: link, code, offer, friends (emails masked), rewards (REF-05) |
| `admin/referrals.ts`, `app/[locale]/admin/esim/referrals` | Admin → eSIM → Referrals: settings, every reward, cancel one on hold, mark a take-back dealt with |
| `scripts/esim-dev-referrals.ts` | End-to-end check of codes, sign-up, coupon, commission, payout and refunds; cleans up and reports leftovers |

| `kyc/rules.ts` | Customer KYC (KYC-01/03): form fields, answer checks, and whether a plan needs it — its own setting, else a listed country, else its supplier's default (pure) |
| `kyc/service.ts`, `models/esim-kyc.model.ts` | Form versions (each publish immutable), submissions with documents in private storage (`biz-private/esim-kyc/<user>/`), review with a reason, the shopper told; which cart variants need KYC |
| `cart/index.ts` (KYC gate) | A plan that needs KYC: a guest cannot add it, and checkout refuses until the shopper is verified |
| `app/[locale]/(store)/account/esims/verification`, `components/esim/kyc-form.tsx` | The shopper's verification status and form |
| `admin/kyc.ts`, `app/[locale]/admin/esim/kyc`, `app/api/esim/admin/kyc/file` | Admin → eSIM → KYC: review (documents through a protected download), the form builder, countries and supplier defaults; per-plan settings in the plan library's bulk actions |
| `scripts/esim-dev-kyc.ts` | End-to-end check of the gate, the form, a submission with a file, rejection and approval; cleans up and reports leftovers |

| `migration/legacy-password.ts` | Shoppers migrated from the old store sign in with their old (bcrypt) password; on the first sign-in it is re-hashed in Better Auth's own format (patch P16) |
| `scripts/esim-dev-legacy-login.ts` | End-to-end check of a migrated password signing in and being re-hashed |
| `migration/legacy-rows.ts` | The old store's users and eSIMs and what they become here (verified users only, bcrypt kept, balances to exact cents, active eSIMs mapped by supplier + plan id) — pure, tested |
| `migration/legacy-source.ts` | Reads the old MySQL database named in `.env` (`LEGACY_MYSQL_*`), in one read-only consistent snapshot |
| `migration/import.ts` | Writes users, balances (store credit + an opening-balance ledger entry, patch P20), referrals and active eSIMs (on one zero-value import order per shopper); every row linked, so running it again changes nothing |
| `admin/migration.ts`, `/admin/esim/migration` | "Check" (counts only) and "Import", in the background; the page shows counts, never people |
| `scripts/esim-dev-migration.ts` | End-to-end check of the import with sample rows (no MySQL) |
| `mobile/esims.ts`, `mobile/dto.ts`, `contracts/mobile/shop/v1/esim.ts` | The shopper app's eSIM endpoints (APP-03/04): list, one eSIM with its QR code and one-tap install links, refresh — the website's readers in the contract's shape (patch P22) |
| `mobile/destinations.ts`, `mobile/topups.ts`, `mobile/devices.ts`, `mobile/home.ts` | The app's destinations and plans (APP-02), top-ups (APP-06), device table (APP-05) and home blocks (APP-01, patch P7) |
| `payments/mobile.ts` | The extension method in the app's redirect flow (APP-09, patch P15): its place in the quote, the payment page in app mode, the verify |
| `cancel/service.ts` | Cancelling issued eSIMs (USR-07/08): the shopper's cancellation of a refundable eSIM not installed yet (supplier first, then the refund to the balance less the fee, shared with the failed-eSIM refund), and a whole-order refund in Storify (patch P4) stopping jobs not bought and cancelling eSIMs not installed |
| `scripts/esim-dev-cancel.ts` | End-to-end check of both |
| `reports/snapshot.ts`, `EsimProfile.snapshot`, `EsimTopup.costUsdMinor` | The sale as it was (ORD-04), written once when the eSIM is bought: supplier plan, coverage, data and days, the unit's share of what the order was charged, and the supplier cost (what the supplier says it charged, else its list price) in its own currency and in USD at that day's rate. Top-ups keep their price and cost from the quote |
| `reports/build.ts`, `reports/service.ts`, `/admin/esim/reports` | eSIM reports (ADM-17): sales and gross margin by supplier, destination and day or month, first-time issue rate and time to issue. Margin counts only sales whose USD cost is known; cancelled or refunded eSIMs and eSIMs without a snapshot are shown apart. Not on the Storify admin dashboard: that needs a new patch point |
| `scripts/esim-dev-reports.ts` | Check of the report's sums against dated test rows |
| `storefront/compare.ts`, `components/esim/plan-comparison.tsx` | A destination's plans side by side (WEB-14): days, data, top-up, price, per GB (best value marked) and per day; "Choose" selects the plan in the plan selector |
| `storefront/compare.ts`, `components/esim/coverage-list.tsx` | The countries a regional or global plan covers, each with its operators fastest network first, searchable by country, code or operator (WEB-15); a country plan lists its operators |
| `scripts/esim-dev-storefront.ts` | Puts a sample regional destination ("Dev Europe", fake supplier) on sale in a development store; `--remove` takes it away |
| `payments/plugins/` | Extension payment plugins (patch P15): BEpusdt (USDT/USDC) and RedeePay (WeChat Pay, Alipay), ported from the old store's signing rules, and a fake one for tests. A plugin only calls its gateway and checks its notifications |
| `payments/registry.ts` | The payment methods the eSIM payment page can offer, each one plugin with its own defaults |
| `payments/checkout.ts` | Storify's checkout for "extension": a checkout attempt (never a pre-written order) and the eSIM payment page |
| `payments/service.ts` | The payment page, starting a payment, the gateway's notification, settling a paid payment through Storify's `finalizeCapturedAttempt` (one order however often it is replayed; a second paid payment is recorded as owed back), and the sweep run with the fulfilment cron |
| `admin/payments.ts`, `/admin/esim/payments` | Switching methods on, their settings (secrets encrypted), the payments that need a person |
| `scripts/esim-dev-payments.ts` | End-to-end check of a checkout paid with the fake method |

**Scheduled jobs.** `esim-fulfillment` (every minute), `esim-catalog` (every 6 hours), `esim-fx` (daily) and `esim-usage` (every 30 minutes) are scheduled in `vercel.json`. A Vercel Hobby plan runs crons at most daily; the fulfilment job then needs Pro. On your own server, call each address with `Authorization: Bearer $CRON_SECRET` from the system scheduler.

Day-priced plans (Stellar's "pick the days" plans) are one variant per allowance, sold per day for the days the shopper picks. A cart holds one line per variant: adding the same variant with other days replaces the line.

A wallet top-up is bought on its own and needs an account. Its amount is the shopper's balance, booked as owed to them (not revenue); only the fee is income and only the fee can be refunded.

Top-ups need an account: the shopper buys one from the eSIM's page in My eSIMs (guests have no such page). A cart holds one top-up line at a time — the top-up product has one variant, and a cart holds one line per variant.

Not automatic: refunding a guest order (needs the gateway refund flow) — admins are told the exact amount.

Requires MongoDB as a replica set (Storify's product writes run in transactions); locally a single-node `--replSet rs0` is enough.

## Environment

- `ESIM_ENCRYPTION_KEY` — 32+ random characters for supplier credentials; falls back to `MESSAGING_ENCRYPTION_KEY`. Changing it means entering the credentials again.

## Commands

```bash
# unit tests (no database, no network)
pnpm exec tsx --test "lib/esim/**/*.test.ts"

# configure a supplier, prove the credentials, pull its catalogue
pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-provider.ts set stellar --status active --cred apiKey=$STELLAR_API_KEY
pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-provider.ts probe stellar
pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-provider.ts sync stellar

# price and publish (new products are drafts until --status active)
pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-catalog.ts fx refresh
pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-catalog.ts reprice
pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-catalog.ts plans activate --product japan-esim
pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs scripts/esim-catalog.ts publish --product japan-esim
```

## Adding a payment gateway

1. Write `payments/plugins/<code>.ts` implementing `PaymentPlugin`: start a payment (a page or QR data) and read a notification, returning `null` for anything not authentic.
2. Add one or more methods to `PAYMENT_METHOD_DEFINITIONS` in `payments/registry.ts`, and its required settings to `REQUIRED` in `payments/service.ts`.
3. Add tests under `payments/__tests__/` with a faked `fetch`. The gateway posts to `/api/esim/pay/notify/<method>`.

Refunds of these payments are recorded as made by hand (Storify does that for any method it cannot refund itself). The shopper app does not offer the method yet. In maintenance mode notifications are refused like other storefront requests, and the gateway retries them.

## Adding a supplier

1. Write `providers/<code>.ts` implementing `EsimProviderAdapter`, mapping onto `ProviderPlan` / `ProviderEsim`.
2. Add an entry to `PROVIDER_DEFINITIONS` in `providers/registry.ts`.
3. Add tests under `providers/__tests__/` with a faked `fetch`.

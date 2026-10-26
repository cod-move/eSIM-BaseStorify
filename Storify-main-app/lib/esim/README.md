# eSIM module

Everything eSIM-specific lives here and in the files named below; official Storify files change only at the patch points in `UPSTREAM-PATCHES.md`.

| Path | What |
|---|---|
| `providers/types.ts` | The adapter contract; shapes follow Stellar's wholesale API |
| `providers/{stellar,esim-access,roamwifi}.ts` | One adapter per supplier; pure TS, no database |
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

**Scheduled jobs.** `esim-fulfillment` (every minute), `esim-catalog` (every 6 hours) and `esim-fx` (daily) are scheduled in `vercel.json`. A Vercel Hobby plan runs crons at most daily; the fulfilment job then needs Pro. On your own server, call each address with `Authorization: Bearer $CRON_SECRET` from the system scheduler.

Day-priced plans (Stellar's "pick the days" plans) are one variant per allowance, sold per day for the days the shopper picks. A cart holds one line per variant: adding the same variant with other days replaces the line.

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

## Adding a supplier

1. Write `providers/<code>.ts` implementing `EsimProviderAdapter`, mapping onto `ProviderPlan` / `ProviderEsim`.
2. Add an entry to `PROVIDER_DEFINITIONS` in `providers/registry.ts`.
3. Add tests under `providers/__tests__/` with a faked `fetch`.

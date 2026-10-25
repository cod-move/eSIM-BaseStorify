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

/**
 * A seller's money: the summary, the payouts, one payout. Read only, in the
 * vendor workspace. The figures are Green Leaf Goods', who sells in two
 * currencies; another seller has none.
 */
import { PAYOUT_STATUSES, type PayoutDetail, type PayoutSummary } from '@/contracts/mobile/biz/v1';

import { MOCK_CURRENCY, daysAgo, money, notFound, oneOf, pageOf } from '../fixtures/shared';
import { grantOf, invalid, type MockContext, type MockRoute } from '../kit';

/** A seller's balance in one currency, as `loadVendorBalance` works it out. */
type MockBalance = {
  readyToPay: number;
  orderCount: number;
  held: { amount: number; orderCount: number; windowDays: number };
  reserve: { amount: number; releaseInDays?: number };
  owed: number;
  minimum: number;
};

/** Each seller's balance by currency: the store's own, and those they have sales in. */
const BALANCES: Record<string, Record<string, MockBalance>> = {
  vendor_green: {
    USD: {
      readyToPay: 186.4,
      orderCount: 6,
      held: { amount: 94.5, orderCount: 3, windowDays: 7 },
      reserve: { amount: 15, releaseInDays: 12 },
      owed: 12,
      minimum: 50,
    },
    EUR: {
      readyToPay: 72.5,
      orderCount: 2,
      held: { amount: 38, orderCount: 1, windowDays: 7 },
      reserve: { amount: 0 },
      owed: 0,
      minimum: 45,
    },
  },
};

/** A currency the seller has sold nothing in: the store works out zeros. */
const NOTHING: MockBalance = {
  readyToPay: 0,
  orderCount: 0,
  held: { amount: 0, orderCount: 0, windowDays: 7 },
  reserve: { amount: 0 },
  owed: 0,
  minimum: 50,
};

/** Sellers whose balance a test narrowed to some currencies (`keepMockPayoutCurrencies`). */
const narrowed = new Map<string, readonly string[]>();

export function reset(): void {
  narrowed.clear();
}

/**
 * For tests: the seller has sales in these currencies only, so the store
 * offers only these (one: a single-currency store).
 */
export function keepMockPayoutCurrencies(vendorId: string, currencies: readonly string[]): void {
  narrowed.set(vendorId, currencies);
}

function balancesOf(ctx: MockContext): Record<string, MockBalance> {
  const vendorId = grantOf(ctx).vendorId;
  const all = (vendorId ? BALANCES[vendorId] : undefined) ?? {};
  const kept = vendorId ? narrowed.get(vendorId) : undefined;
  return kept
    ? Object.fromEntries(Object.entries(all).filter(([currency]) => kept.includes(currency)))
    : all;
}

/** GET /payouts/summary: in `?currency=`, else in the store's own, with every currency on offer. */
function summaryOf(ctx: MockContext): PayoutSummary {
  const asked = ctx.query.get('currency');
  if (asked !== null && !/^[A-Za-z]{3}$/.test(asked)) {
    throw invalid('currency', 'Send a three-letter currency code');
  }
  const currency = asked?.toUpperCase() || MOCK_CURRENCY;
  const balances = balancesOf(ctx);
  const available = Object.keys(balances).sort();
  const balance = balances[currency] ?? NOTHING;
  const inCurrency = (amount: number) => money(amount, ctx.locale, currency);
  return {
    readyToPay: inCurrency(balance.readyToPay),
    availableCurrencies: available.length ? available : [MOCK_CURRENCY],
    orderCount: balance.orderCount,
    heldInReturnWindow: { ...balance.held, amount: inCurrency(balance.held.amount) },
    reserveHeld: {
      amount: inCurrency(balance.reserve.amount),
      ...(balance.reserve.releaseInDays !== undefined
        ? { releaseAt: daysAgo(-balance.reserve.releaseInDays) }
        : {}),
    },
    owedToPlatform: inCurrency(balance.owed),
    minimumPayout: inCurrency(balance.minimum),
  };
}

type MockPayout = {
  id: string;
  number: string;
  /** The currency it was made in; the store's own when not given. */
  currency?: string;
  status: string;
  periodStartDaysAgo: number;
  periodEndDaysAgo: number;
  gross: number;
  commission: number;
  shipping: number;
  adjustments: number;
  orderCount: number;
  method?: string;
  reference?: string;
  paidDaysAgo?: number;
};

/** Newest first. `net` is gross − commission + shipping + adjustments. */
const PAYOUTS: Record<string, MockPayout[]> = {
  vendor_green: [
    {
      id: 'pay_8',
      number: 'PO-2026-0008',
      status: 'processing',
      periodStartDaysAgo: 14,
      periodEndDaysAgo: 0,
      gross: 412,
      commission: 41.2,
      shipping: 24,
      adjustments: 0,
      orderCount: 11,
    },
    {
      id: 'pay_7',
      number: 'PO-2026-0007',
      status: 'paid',
      periodStartDaysAgo: 28,
      periodEndDaysAgo: 14,
      gross: 538.5,
      commission: 53.85,
      shipping: 32,
      adjustments: -12,
      orderCount: 15,
      method: 'bank',
      reference: 'BRAC-77812',
      paidDaysAgo: 4,
    },
    {
      id: 'pay_6',
      number: 'PO-2026-0006',
      status: 'paid',
      periodStartDaysAgo: 42,
      periodEndDaysAgo: 28,
      gross: 301,
      commission: 30.1,
      shipping: 16,
      adjustments: 0,
      orderCount: 9,
      method: 'bank',
      reference: 'BRAC-76120',
      paidDaysAgo: 18,
    },
    {
      id: 'pay_5',
      number: 'PO-2026-0005',
      status: 'failed',
      periodStartDaysAgo: 56,
      periodEndDaysAgo: 42,
      gross: 120,
      commission: 12,
      shipping: 8,
      adjustments: 0,
      orderCount: 4,
      method: 'gateway',
    },
    {
      id: 'pay_4',
      number: 'PO-2026-0004',
      status: 'paid',
      periodStartDaysAgo: 70,
      periodEndDaysAgo: 56,
      gross: 655,
      commission: 65.5,
      shipping: 40,
      adjustments: -20,
      orderCount: 19,
      method: 'cash',
      paidDaysAgo: 50,
    },
    {
      id: 'pay_3',
      number: 'PO-2026-0003',
      currency: 'EUR',
      status: 'paid',
      periodStartDaysAgo: 84,
      periodEndDaysAgo: 70,
      gross: 210,
      commission: 21,
      shipping: 12,
      adjustments: 0,
      orderCount: 6,
      method: 'bank',
      reference: 'SEPA-40318',
      paidDaysAgo: 64,
    },
  ],
};

function net(payout: MockPayout): number {
  return payout.gross - payout.commission + payout.shipping + payout.adjustments;
}

function detailOf(payout: MockPayout, locale: string): PayoutDetail {
  // Every amount of a payout is in the currency it was made in.
  const inCurrency = (amount: number) => money(amount, locale, payout.currency);
  return {
    id: payout.id,
    number: payout.number,
    status: payout.status,
    periodStart: daysAgo(payout.periodStartDaysAgo),
    periodEnd: daysAgo(payout.periodEndDaysAgo),
    net: inCurrency(net(payout)),
    createdAt: daysAgo(payout.periodEndDaysAgo),
    ...(payout.paidDaysAgo !== undefined ? { paidAt: daysAgo(payout.paidDaysAgo) } : {}),
    gross: inCurrency(payout.gross),
    commission: inCurrency(payout.commission),
    shipping: inCurrency(payout.shipping),
    adjustments: inCurrency(payout.adjustments),
    orderCount: payout.orderCount,
    ...(payout.method ? { method: payout.method } : {}),
    ...(payout.reference ? { reference: payout.reference } : {}),
  };
}

function payoutsOf(ctx: MockContext): MockPayout[] {
  const vendorId = grantOf(ctx).vendorId;
  return vendorId ? (PAYOUTS[vendorId] ?? []) : [];
}

const VENDOR_PAYOUTS = { capability: 'VIEW_PAYOUTS', only: 'vendor' } as const;

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/payouts/summary',
    access: VENDOR_PAYOUTS,
    handle: summaryOf,
  },
  {
    method: 'GET',
    path: '/payouts',
    access: VENDOR_PAYOUTS,
    handle: (ctx) => {
      const status = oneOf(ctx.query, 'status', PAYOUT_STATUSES);
      const rows = payoutsOf(ctx).filter((payout) => !status || payout.status === status);
      const page = pageOf(rows, ctx.query);
      return {
        ...page,
        items: page.items.map((payout) => {
          const {
            gross,
            commission,
            shipping,
            adjustments,
            orderCount,
            method,
            reference,
            ...item
          } = detailOf(payout, ctx.locale);
          return item;
        }),
      };
    },
  },
  {
    method: 'GET',
    path: /^\/payouts\/([^/]+)$/,
    access: VENDOR_PAYOUTS,
    handle: (ctx, [id = '']) => {
      const payout = payoutsOf(ctx).find((candidate) => candidate.id === id);
      if (!payout) throw notFound('Payout');
      return detailOf(payout, ctx.locale);
    },
  },
];

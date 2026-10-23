/**
 * What moved the mock store's stock, as the store records it: adjustments
 * (with who, why and the count after), transfers shipped, received and
 * cancelled, and returns put back on sale. Sales are not recorded as
 * movements, so there are none. Times are relative to now, so the history
 * always reads as recent.
 */
import type { StockMovementKind, StockMovement } from '@/contracts/mobile/biz/v1';

import { daysAgo, hoursAgo } from './shared';

export type MockMovement = {
  id: string;
  productId: string;
  at: string;
  kind: StockMovementKind;
  change: number;
  quantityAfter?: number;
  variantId?: string;
  /** Left out: recorded without a location (a whole-count edit, a return put back where it sold). */
  locationId?: string;
  reason?: StockMovement['reason'];
  set?: boolean;
  note?: string;
  reference?: StockMovement['reference'];
  /** The account that moved the units (`fixtures/accounts.ts`); left out, nobody recorded. */
  by?: string;
};

const SAGE = 'var_mug_sage';
const SAND = 'var_mug_sand';
const CHARCOAL = 'var_mug_charcoal';

/** The mug's counts over a month: enough for more than one page. */
function mugCounts(): MockMovement[] {
  const variants = [SAGE, CHARCOAL, SAND];
  return Array.from({ length: 24 }, (_, index) => {
    const variantId = variants[index % variants.length];
    const incoming = index % 4 !== 3;
    return {
      id: `mov_mug_${String(index).padStart(2, '0')}`,
      productId: 'prod_mug',
      at: daysAgo(index + 3),
      kind: 'adjustment' as const,
      change: incoming ? 4 : -1,
      quantityAfter: incoming ? 10 + (index % 5) : 6,
      variantId,
      locationId: 'loc_green',
      reason: incoming ? ('received' as const) : ('count' as const),
      by: index % 2 === 0 ? 'user_seller' : 'user_seller_staff',
    };
  });
}

/** A fresh copy of the history, in no particular order. */
export function seedMovements(): MockMovement[] {
  return [
    // The store's own vase, at its two locations.
    {
      id: 'mov_vase_01',
      productId: 'prod_vase',
      at: hoursAgo(2),
      kind: 'adjustment',
      change: 6,
      quantityAfter: 18,
      locationId: 'loc_main',
      reason: 'received',
      note: 'Kiln delivery, batch 14',
      by: 'user_admin',
    },
    {
      id: 'mov_vase_02',
      productId: 'prod_vase',
      at: hoursAgo(5),
      kind: 'transfer_received',
      change: 4,
      locationId: 'loc_popup',
      reference: { kind: 'transfer', number: 'TR-1042' },
      by: 'user_staff',
    },
    {
      id: 'mov_vase_03',
      productId: 'prod_vase',
      at: daysAgo(1),
      kind: 'transfer_shipped',
      change: -4,
      locationId: 'loc_main',
      reference: { kind: 'transfer', number: 'TR-1042' },
      by: 'user_warehouse',
    },
    {
      id: 'mov_vase_04',
      productId: 'prod_vase',
      at: daysAgo(1.2),
      kind: 'return_restocked',
      change: 1,
      locationId: 'loc_popup',
      reference: { kind: 'return', number: 'RET-2001' },
      by: 'user_staff',
    },
    {
      id: 'mov_vase_05',
      productId: 'prod_vase',
      at: daysAgo(2),
      kind: 'adjustment',
      change: -1,
      quantityAfter: 2,
      locationId: 'loc_popup',
      reason: 'damaged',
      note: 'Chipped rim',
      by: 'user_staff',
    },
    {
      id: 'mov_vase_06',
      productId: 'prod_vase',
      at: daysAgo(3),
      kind: 'adjustment',
      change: -2,
      quantityAfter: 16,
      locationId: 'loc_main',
      set: true,
      by: 'user_admin',
    },
    {
      id: 'mov_vase_07',
      productId: 'prod_vase',
      at: daysAgo(4),
      kind: 'return_restocked',
      change: 1,
      reference: { kind: 'return', number: 'RET-1980' },
      by: 'user_admin',
    },
    {
      id: 'mov_vase_08',
      productId: 'prod_vase',
      at: daysAgo(6),
      kind: 'transfer_cancelled',
      change: 3,
      locationId: 'loc_main',
      reference: { kind: 'transfer', number: 'TR-1039' },
      by: 'user_warehouse',
    },
    {
      id: 'mov_vase_09',
      productId: 'prod_vase',
      at: daysAgo(6.1),
      kind: 'transfer_shipped',
      change: -3,
      locationId: 'loc_main',
      reference: { kind: 'transfer', number: 'TR-1039' },
      by: 'user_warehouse',
    },
    // Green Leaf's towel: its seller, and the store's administrator.
    {
      id: 'mov_towel_01',
      productId: 'prod_towel',
      at: hoursAgo(26),
      kind: 'adjustment',
      change: 2,
      quantityAfter: 3,
      locationId: 'loc_green',
      reason: 'received',
      by: 'user_seller',
    },
    {
      id: 'mov_towel_02',
      productId: 'prod_towel',
      at: daysAgo(5),
      kind: 'adjustment',
      change: -1,
      quantityAfter: 1,
      locationId: 'loc_green',
      reason: 'correction',
      note: 'Counted against the order sheet',
      by: 'user_admin',
    },
    // Green Leaf's mug, by variant.
    {
      id: 'mov_mug_sand',
      productId: 'prod_mug',
      at: hoursAgo(3),
      kind: 'adjustment',
      change: -2,
      quantityAfter: 0,
      variantId: SAND,
      locationId: 'loc_green',
      reason: 'damaged',
      by: 'user_seller_staff',
    },
    ...mugCounts(),
  ];
}

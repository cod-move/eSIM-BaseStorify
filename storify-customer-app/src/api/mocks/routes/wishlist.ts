/** The shopper's wishlist. Adding and removing one product live in account.ts. */
import type { WishlistItem } from '@/contracts/mobile/shop/v1';

import { savedProductIds } from '../fixtures/wishlist';
import { listProducts } from '../fixtures/products';
import { requireUser, type MockRoute } from '../kit';

const DAY = 24 * 60 * 60 * 1000;
const FIRST_SAVED = Date.parse('2026-09-01T10:00:00Z');

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/wishlist',
    handle: (ctx) => {
      const ids = [...savedProductIds(requireUser(ctx))];
      const cards = new Map(
        listProducts(ctx.locale).map(({ category: _c, ...card }) => [card.id, card])
      );

      // Newest first. A product the store no longer sells is left out, as the store does.
      const items: WishlistItem[] = ids
        .map((id, index) => ({ id, addedAt: new Date(FIRST_SAVED + index * DAY).toISOString() }))
        .reverse()
        .flatMap(({ id, addedAt }) => {
          const product = cards.get(id);
          return product ? [{ product, addedAt }] : [];
        });

      // The cursor is opaque to the app. Here it happens to be an offset.
      const offset = Number(ctx.query.get('cursor') ?? 0);
      const limit = Math.min(Number(ctx.query.get('limit') ?? 20), 40);
      return {
        items: items.slice(offset, offset + limit),
        nextCursor: offset + limit < items.length ? String(offset + limit) : null,
      };
    },
  },
];

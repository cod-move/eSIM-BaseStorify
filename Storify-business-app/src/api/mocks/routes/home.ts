/** GET /home: the tiles the operator may see, from the same data the lists hold. */
import type { HomeTile } from '@/contracts/mobile/biz/v1';

import { money } from '../fixtures/shared';
import { grantOf, type MockRoute } from '../kit';
import { scopeOf } from '../scope';

import { unreadTotal } from './inbox';
import { orderFigures } from './orders';
import { LOW_STOCK_THRESHOLD, lowStockCount } from './products';
import { openMockReturns } from './returns';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/home',
    access: 'workspace',
    handle: (ctx) => {
      const grant = grantOf(ctx);
      const scope = scopeOf(grant);
      const can = (capability: (typeof grant.capabilities)[number]) =>
        grant.capabilities.includes(capability);
      const tiles: HomeTile[] = [];
      const figures = can('VIEW_ORDERS') ? orderFigures(scope) : null;

      if (figures) {
        tiles.push(
          { kind: 'COLLECTED_TODAY', money: money(figures.collectedToday, ctx.locale) },
          { kind: 'COLLECTED_THIS_MONTH', money: money(figures.collectedThisMonth, ctx.locale) },
          { kind: 'ORDERS_NEEDING_ACTION', count: figures.needingAction }
        );
      }
      if (can('VIEW_INBOX')) tiles.push({ kind: 'UNREAD_MESSAGES', count: unreadTotal(scope) });
      if (can('VIEW_PRODUCTS')) tiles.push({ kind: 'LOW_STOCK', count: lowStockCount(scope) });
      if (can('VIEW_RETURNS')) tiles.push({ kind: 'OPEN_RETURNS', count: openMockReturns(ctx) });

      const today = new Date().toISOString().slice(0, 10);
      const points = Array.from({ length: 7 }, (_, index) => {
        const day = new Date(Date.parse(`${today}T00:00:00Z`) - (6 - index) * 86_400_000)
          .toISOString()
          .slice(0, 10);
        return { day, money: money(figures?.collectedDays.get(day) ?? 0, ctx.locale) };
      });
      const maximum = Math.max(0, ...points.map((point) => point.money.amount));

      return {
        day: today,
        lowStockThreshold: LOW_STOCK_THRESHOLD,
        tiles,
        ...(figures
          ? {
              collectionTrend: {
                points: points.map((point) => ({
                  ...point,
                  fraction: maximum ? point.money.amount / maximum : 0,
                })),
                maximum: money(maximum, ctx.locale),
                baseline: money(0, ctx.locale),
              },
            }
          : {}),
      };
    },
  },
];

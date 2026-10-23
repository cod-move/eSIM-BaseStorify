/** Orders: the history, one order, cancelling it. */
import {
  canCancel,
  cancel,
  findOrder,
  listOrders,
  resetOrders,
  toDetail,
  toSummary,
} from '../fixtures/orders';
import { withReturns } from '../fixtures/returns';
import { MockError, requireUser, type MockContext, type MockRoute } from '../kit';

function orderOf(ctx: MockContext, id: string) {
  requireUser(ctx);
  const order = findOrder(id);
  // Another shopper's order and a made-up id look the same: 404, never 403.
  if (!order) throw new MockError(404, 'NOT_FOUND', 'Order not found');
  return order;
}

/** A one-page PDF that names the order: enough for a viewer to open. */
export function invoicePdf(number: string): string {
  const stream = `BT /F1 18 Tf 72 720 Td (Invoice ${number}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  const table = offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('');
  return `${body}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${table}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/orders',
    handle: (ctx) => {
      requireUser(ctx);
      const cursor = ctx.query.get('cursor');
      const offset = cursor === null ? 0 : Number(cursor);
      if (!Number.isInteger(offset) || offset < 0) {
        throw new MockError(400, 'VALIDATION_ERROR', 'Unknown cursor');
      }
      const limit = Math.min(Math.max(Number(ctx.query.get('limit') ?? 20), 1), 40);
      const orders = listOrders();
      return {
        items: orders.slice(offset, offset + limit).map((order) => ({
          ...toSummary(order, ctx.locale),
          // The same answer as the order's own page.
          canReturn: withReturns(order, toDetail(order, ctx.locale)).canReturn ?? false,
        })),
        nextCursor: offset + limit < orders.length ? String(offset + limit) : null,
      };
    },
  },
  {
    method: 'GET',
    path: /^\/orders\/([^/]+)$/,
    handle: (ctx, [id = '']) => {
      const order = orderOf(ctx, id);
      return withReturns(order, toDetail(order, ctx.locale));
    },
  },
  {
    // The real store answers the PDF itself; the mock's envelope carries its
    // bytes, and `downloadBinary` turns them back (see `mockFile` in the transport).
    method: 'GET',
    path: /^\/orders\/([^/]+)\/invoice$/,
    handle: (ctx, [id = '']) => {
      const order = orderOf(ctx, id);
      return { base64: btoa(invoicePdf(order.number)) };
    },
  },
  {
    method: 'POST',
    path: /^\/orders\/([^/]+)\/cancel$/,
    handle: (ctx, [id = '']) => {
      const order = orderOf(ctx, id);
      if (!canCancel(order)) {
        throw new MockError(
          409,
          'CONFLICT',
          'This order can no longer be cancelled',
          'NOT_CANCELLABLE'
        );
      }
      const paid = order.paymentStatus === 'paid';
      cancel(order, new Date().toISOString());
      const detail = toDetail(order, ctx.locale);
      return {
        order: detail,
        refund: paid ? { refunded: true, amount: detail.totals.total, owed: false } : undefined,
      };
    },
  },
];

export const reset = resetOrders;

import {
  ReturnCreateRequest,
  ReturnPreviewRequest,
  ReturnActionRequest,
  RefundPreviewRequest,
  RefundExecuteRequest,
  type ReturnCase,
  type ReturnOptions,
  type ReturnPreview,
  type RefundPreview,
  type RefundResult,
  type OperationStatus,
} from '@/contracts/mobile/biz/v1';
import {
  accountOf,
  grantOf,
  requireCapability,
  invalid,
  MockError,
  type MockContext,
  type MockRoute,
} from '../kit';
import { money, pageOf, MOCK_ORIGIN } from '../fixtures/shared';
import { LOCATIONS } from '../fixtures/products';
import { VENDORS } from '../fixtures/accounts';
import { MOCK_UPLOAD_POLICIES } from '../fixtures/uploads';
import { reaches, scopeOf, locationsOf } from '../scope';
import { allMockOrders, mockOrderDetail } from './orders';
import { getMockProduct, touchMockProduct } from './products';
import { registerMockUploadTarget, editorMockUpload } from './uploads';
import { keepMockOperation } from './operations';

// These numbers and rules belong to the mock store, never to the native client.
type HeldCase = { data: ReturnCase; vendorId?: string; labelId?: string };
const cases = new Map<string, HeldCase>();
const receipts = new Map<
  string,
  { data: RefundResult; actor: string; workspace: string; target: RefundPreviewRequest['target'] }
>();
const quotes = new Map<
  string,
  { data: RefundPreview; request: RefundPreviewRequest; actor: string; workspace: string }
>();
let next = 1;
let nextSettlement: RefundResult['settlementStatus'] | undefined;
const terminal = new Set(['closed', 'cancelled', 'rejected', 'refunded']);
const openStatuses = new Set([
  'requested',
  'approved',
  'awaiting_shipment',
  'in_transit',
  'received',
  'inspected',
  'refund_pending',
  'partially_refunded',
]);
const fail = (reason: string, status = 409) =>
  new MockError(status, 'CONFLICT', reason, { reason });
const rawOrder = (ctx: MockContext, id: string) => {
  mockOrderDetail(ctx, id);
  return allMockOrders().find((o) => o.id === id)!;
};
const breakdown = (value: number, locale: string) => ({
  subtotal: money(value, locale),
  discount: money(0, locale),
  tax: money(0, locale),
  shipping: money(0, locale),
  restockingFee: money(0, locale),
  returnShippingFee: money(0, locale),
  total: money(value, locale),
});
function caseOf(ctx: MockContext, id: string): HeldCase {
  seed(ctx);
  const row = cases.get(id);
  if (!row || !reaches(scopeOf(grantOf(ctx)), row.vendorId))
    throw new MockError(404, 'NOT_FOUND', 'Return not found');
  rawOrder(ctx, row.data.orderId);
  return row;
}
function canRefund(ctx: MockContext, row: ReturnCase) {
  return (
    grantOf(ctx).capabilities.includes('ISSUE_REFUNDS') &&
    !['requested', 'rejected', 'cancelled', 'closed'].includes(row.status) &&
    !['processing', 'manual_required'].includes(row.refundStatus) &&
    row.refunded.amount < row.estimate.total.amount
  );
}
function actions(ctx: MockContext, row: ReturnCase): ReturnCase['actions'] {
  if (!grantOf(ctx).capabilities.includes('HANDLE_RETURNS') || terminal.has(row.status)) return [];
  if (row.status === 'requested') return ['approve', 'reject', 'cancel'];
  const list: ReturnCase['actions'] = [];
  if (
    !['processing', 'succeeded'].includes(row.refundStatus) &&
    !row.items.some((i) => i.quantityRestocked)
  )
    list.push('cancel');
  if (row.returnMethod !== 'no_shipping') {
    list.push('record_receipt');
    if (['approved', 'awaiting_shipment', 'in_transit'].includes(row.status))
      list.push('record_tracking');
  }
  if (
    row.items.some(
      (i) => (i.quantityReceived ?? 0) > i.quantityRestocked + (i.quantityWrittenOff ?? 0)
    )
  )
    list.push('restock', 'record_disposition');
  if (
    row.refundStatus === 'manual_required' &&
    grantOf(ctx).capabilities.includes('RECORD_REFUND_SETTLEMENT')
  )
    list.push('record_settlement');
  if (row.refundStatus !== 'processing') list.push('close');
  return list;
}
function dto(ctx: MockContext, row: HeldCase): ReturnCase {
  return {
    ...row.data,
    actions: actions(ctx, row.data),
    canPreviewRefund: canRefund(ctx, row.data),
    canOverrideEligibility: grantOf(ctx).capabilities.includes('OVERRIDE_RETURN_ELIGIBILITY'),
  };
}
export function reset() {
  cases.clear();
  receipts.clear();
  quotes.clear();
  next = 1;
  nextSettlement = undefined;
}
export function setNextMockRefundStatus(status: RefundResult['settlementStatus']) {
  nextSettlement = status;
}
export function expireMockRefundQuotes() {
  for (const held of quotes.values()) held.data.expiresAt = new Date(Date.now() - 1).toISOString();
}
export function changeMockReturn(id: string, change: (row: ReturnCase) => void) {
  const row = cases.get(id);
  if (row) {
    change(row.data);
    row.data.version = `${Date.now()}-${next++}`;
  }
}
export function changeMockRefund(id: string, status: RefundResult['settlementStatus']) {
  const held = receipts.get(id);
  if (held) {
    held.data.settlementStatus = status;
    const row = held.target.kind === 'return' ? cases.get(held.target.id) : undefined;
    if (row) {
      row.data.refundStatus = status;
      held.data.return = row.data;
    }
    const order = allMockOrders().find((o) => o.id === (row?.data.orderId ?? held.target.id));
    if (order && status === 'succeeded') {
      order.refunded = (order.refunded ?? 0) + held.data.amount.amount;
      order.paymentStatus = 'partially_refunded';
      order.updatedAt = new Date().toISOString();
    }
  }
}
function seed(ctx: MockContext) {
  if (cases.size || next !== 1) return;
  const order = allMockOrders().find((o) => o.id === 'ord_1036')!;
  const line = order.lines[0]!;
  cases.set('ret_store_1', {
    data: {
      id: 'ret_store_1',
      number: 'R1001',
      orderId: order.id,
      orderNumber: order.number,
      status: 'requested',
      refundStatus: 'none',
      customerName: order.customer?.name,
      itemCount: 1,
      createdAt: order.placedAt,
      actions: [],
      version: 'return-1',
      reason: 'other',
      returnMethod: 'customer_ships',
      refundPayer: 'platform',
      items: [
        {
          orderItemIndex: 0,
          productId: line.productId,
          name: line.name,
          quantityRequested: 1,
          quantityApproved: 0,
          quantityRestocked: 0,
        },
      ],
      evidence: [],
      estimate: breakdown(24, ctx.locale),
      estimatedRefund: money(24, ctx.locale),
      refunded: money(0, ctx.locale),
      timeline: [],
      canPreviewRefund: false,
      canOverrideEligibility: false,
    },
  });
  registerMockUploadTarget({
    target: { kind: 'return', id: 'ret_store_1' },
    vendorIds: [undefined],
  });
}
export function openMockReturns(ctx: MockContext) {
  seed(ctx);
  return [...cases.values()].filter(
    (r) => reaches(scopeOf(grantOf(ctx)), r.vendorId) && openStatuses.has(r.data.status)
  ).length;
}
function options(ctx: MockContext, id: string): ReturnOptions {
  seed(ctx);
  const order = rawOrder(ctx, id);
  const detail = mockOrderDetail(ctx, id);
  return {
    orderId: id,
    orderNumber: order.number,
    version: order.updatedAt,
    canOverride: grantOf(ctx).capabilities.includes('OVERRIDE_RETURN_ELIGIBILITY'),
    reasons: [
      {
        code: 'damaged_or_defective',
        label: 'Damaged or defective',
        noteRequired: false,
        evidenceRequired: true,
      },
      {
        code: 'wrong_size_or_variant',
        label: 'Wrong size or variant',
        noteRequired: false,
        evidenceRequired: false,
      },
      { code: 'other', label: 'Other', noteRequired: true, evidenceRequired: false },
    ],
    resolutions: ['refund'],
    methods: [
      { id: 'customer_ships', label: 'Customer ships the item' },
      { id: 'label', label: 'Prepaid label' },
      { id: 'no_shipping', label: 'No shipping required' },
    ],
    lines: detail.lines.map((line) => {
      const index = order.lines.findIndex(
        (item) => item.productId === line.productId && item.variantId === line.variantId
      );
      const reserved = [...cases.values()]
        .filter((r) => r.data.orderId === id && !['rejected', 'cancelled'].includes(r.data.status))
        .flatMap((r) => r.data.items)
        .filter((i) => i.orderItemIndex === index)
        .reduce((n, i) => n + i.quantityRequested, 0);
      const fulfilled = order.consignments.some(
        (c) => c.lineIndexes.includes(index) && ['delivered', 'collected'].includes(c.status)
      );
      return {
        index,
        name: line.name,
        image: line.image,
        ordered: line.quantity,
        eligible: fulfilled ? Math.max(0, line.quantity - reserved) : 0,
        reason: fulfilled ? undefined : 'RETURN_NOT_ELIGIBLE',
        finalSale: false,
      };
    }),
    locations: [
      ...new Set(
        order.consignments
          .filter((p) => reaches(scopeOf(grantOf(ctx)), p.vendorId))
          .flatMap((p) => locationsOf(p.vendorId))
      ),
    ].map((id) => ({ id, name: LOCATIONS[id]!.name })),
    uploads: [MOCK_UPLOAD_POLICIES.return_evidence, MOCK_UPLOAD_POLICIES.return_label],
  };
}
function validateItems(ctx: MockContext, request: ReturnPreviewRequest) {
  const offered = options(ctx, request.orderId);
  const seen = new Set<number>();
  if (request.eligibilityOverride) requireCapability(ctx, 'OVERRIDE_RETURN_ELIGIBILITY');
  for (const item of request.items) {
    if (seen.has(item.index)) throw fail('RETURN_ITEM_LISTED_TWICE');
    seen.add(item.index);
    const line = offered.lines.find((l) => l.index === item.index);
    if (
      !line ||
      item.quantity > line.ordered ||
      (!request.eligibilityOverride && item.quantity > line.eligible)
    )
      throw fail('RETURN_QUANTITY_CHANGED');
  }
  return offered;
}
function preview(ctx: MockContext, request: ReturnPreviewRequest): ReturnPreview {
  validateItems(ctx, request);
  const order = rawOrder(ctx, request.orderId);
  const parcels = order.consignments
    .map((part) => ({
      ownerName: part.vendorId ? VENDORS[part.vendorId]?.name : undefined,
      items: request.items.filter((i) => part.lineIndexes.includes(i.index)),
      refund: breakdown(
        request.items
          .filter((i) => part.lineIndexes.includes(i.index))
          .reduce((sum, i) => sum + order.lines[i.index]!.unitPrice * i.quantity, 0),
        ctx.locale
      ),
    }))
    .filter((p) => p.items.length);
  return {
    parcels,
    total: money(
      parcels.reduce((sum, p) => sum + p.refund.total.amount, 0),
      ctx.locale
    ),
    warnings: [],
  };
}
function operation(
  ctx: MockContext,
  routeId: string,
  resources: OperationStatus['resources'],
  authorize: (c: MockContext) => void
): OperationStatus {
  const result: OperationStatus = {
    key: ctx.headers.get('Idempotency-Key')!,
    routeId,
    resources,
    state: 'succeeded',
    updatedAt: new Date().toISOString(),
  };
  keepMockOperation(ctx, result, authorize);
  return result;
}
function location(ctx: MockContext, row: HeldCase, id?: string) {
  if (!id || !locationsOf(row.vendorId).includes(id)) throw fail('RETURN_LOCATION_NOT_ALLOWED');
  return id;
}
function applyStock(
  ctx: MockContext,
  row: HeldCase,
  items: { index: number; quantity: number; action?: string }[],
  locationId?: string
) {
  const id = location(ctx, row, locationId);
  const seen = new Set<number>();
  const validated = items.map((item) => {
    const line = row.data.items.find((i) => i.orderItemIndex === item.index);
    if (
      !line ||
      seen.has(item.index) ||
      item.quantity >
        (line.quantityReceived ?? 0) - line.quantityRestocked - (line.quantityWrittenOff ?? 0)
    )
      throw fail('RETURN_QUANTITY_CHANGED');
    seen.add(item.index);
    if (item.action !== 'written_off' && !['new', 'opened'].includes(line.condition ?? ''))
      throw fail('RETURN_NOT_ELIGIBLE');
    const product = getMockProduct(ctx, line.productId);
    const stock = line.variantId
      ? product.variants.find((v) => v.id === line.variantId)?.stock[id]
      : product.stock[id];
    if (item.action !== 'written_off' && !stock && !product.untracked)
      throw fail('RETURN_LOCATION_NOT_ALLOWED');
    return { item, line, product, stock };
  });
  for (const { item, line, product, stock } of validated) {
    if (item.action === 'written_off')
      line.quantityWrittenOff = (line.quantityWrittenOff ?? 0) + item.quantity;
    else {
      line.quantityRestocked += item.quantity;
      if (stock) stock.available += item.quantity;
      touchMockProduct(product);
    }
  }
}
function refundQuote(ctx: MockContext, request: RefundPreviewRequest): RefundPreview {
  let row: HeldCase | undefined;
  if (request.target.kind === 'return') {
    row = caseOf(ctx, request.target.id);
    if (!canRefund(ctx, row.data)) throw fail('REFUND_NOT_ALLOWED');
  }
  const order = rawOrder(ctx, row?.data.orderId ?? request.target.id);
  const detail = mockOrderDetail(ctx, order.id);
  if (
    [...receipts.values()].some(
      (r) =>
        r.data.order?.id === order.id &&
        ['processing', 'manual_required'].includes(r.data.settlementStatus)
    )
  )
    throw fail('REFUND_PENDING');
  if (!['paid', 'partially_refunded'].includes(order.paymentStatus))
    throw fail('REFUND_NOT_ALLOWED');
  if (!row && (request.restoreInventory || request.feeOverride || request.faultOverride))
    throw fail('REFUND_NOT_ALLOWED');
  if (request.manual) {
    requireCapability(ctx, 'RECORD_REFUND_SETTLEMENT');
    if (!request.settlement?.method) throw fail('SETTLEMENT_NOT_ALLOWED');
  }
  if (!row && ['cod', 'cash', 'bank_transfer'].includes(order.paymentMethod) && !request.manual)
    throw fail('SETTLEMENT_NOT_ALLOWED');
  const collected = detail.totals.total.amount;
  const previously = order.refunded ?? 0;
  const full = row
    ? row.data.items.reduce(
        (n, i) => n + order.lines[i.orderItemIndex]!.unitPrice * i.quantityApproved,
        0
      )
    : collected;
  const maximum = Math.max(
    0,
    Math.min(full - (row?.data.refunded.amount ?? 0), collected - previously)
  );
  const eligible = row
    ? row.data.items.map((i) => ({ index: i.orderItemIndex, quantity: i.quantityApproved }))
    : detail.lines.map((i) => ({ index: i.index, quantity: i.quantity }));
  const selected = request.items?.length ? request.items : eligible;
  const seen = new Set<number>();
  for (const item of selected) {
    const original = eligible.find((i) => i.index === item.index);
    if (!original || seen.has(item.index) || item.quantity > original.quantity)
      throw fail('RETURN_QUANTITY_CHANGED');
    seen.add(item.index);
  }
  const selectedAmount =
    selected.reduce((n, i) => n + order.lines[i.index]!.unitPrice * i.quantity, 0) +
    (request.deliveryRefund ?? 0);
  const amount = request.amount ?? (request.items?.length ? selectedAmount : maximum);
  if (amount <= 0 || amount > maximum) throw fail('REFUND_AMOUNT_EXCEEDED');
  if (request.restoreInventory && row) {
    location(ctx, row, request.locationId);
    for (const i of selected) {
      const line = row.data.items.find((l) => l.orderItemIndex === i.index)!;
      if (
        i.quantity >
          (line.quantityReceived ?? 0) - line.quantityRestocked - (line.quantityWrittenOff ?? 0) ||
        !['new', 'opened'].includes(line.condition ?? '')
      )
        throw fail('RETURN_NOT_ELIGIBLE');
    }
  }
  const token = `quote-${next++}`;
  const data: RefundPreview = {
    token,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    target: request.target,
    version: row?.data.version ?? order.updatedAt,
    amount: money(amount, ctx.locale),
    maximum: money(maximum, ctx.locale),
    previouslyRefunded: money(previously, ctx.locale),
    collected: money(collected, ctx.locale),
    breakdown: breakdown(amount, ctx.locale),
    destination: {
      kind:
        request.manual || ['cod', 'cash', 'bank_transfer'].includes(order.paymentMethod)
          ? 'manual'
          : 'original',
      label: request.manual ? request.settlement!.method : order.paymentMethod,
      payer: row?.data.refundPayer ?? 'platform',
      settlementRequired:
        !request.manual && ['cod', 'cash', 'bank_transfer'].includes(order.paymentMethod),
    },
    resultingPaymentStatus: amount === collected - previously ? 'refunded' : 'partially_refunded',
    resultingReturnStatus: row ? 'refunded' : undefined,
    stock: selected.map((i) => ({
      ...i,
      locationId: request.locationId,
      effect: request.restoreInventory ? 'restock' : 'none',
    })),
    warnings: [],
  };
  quotes.set(token, { data, request, actor: accountOf(ctx).id, workspace: grantOf(ctx).workspace });
  return data;
}

export const routes: readonly MockRoute[] = [
  {
    method: 'GET',
    path: '/returns',
    access: { capability: 'VIEW_RETURNS' },
    handle: (ctx) => {
      seed(ctx);
      const tab = ctx.query.get('tab') ?? 'all';
      const search = ctx.query.get('search')?.toLowerCase();
      const orderId = ctx.query.get('orderId');
      const rows = [...cases.values()]
        .filter((r) => reaches(scopeOf(grantOf(ctx)), r.vendorId))
        .map((r) => dto(ctx, r))
        .filter(
          (r) =>
            (!orderId || r.orderId === orderId) &&
            (!search ||
              `${r.number} ${r.orderNumber} ${r.customerName}`.toLowerCase().includes(search)) &&
            (tab === 'all' ||
              (tab === 'open'
                ? openStatuses.has(r.status)
                : tab === 'pending'
                  ? ['pending', 'processing', 'manual_required', 'failed'].includes(
                      r.refundStatus
                    ) && !['rejected', 'cancelled', 'closed'].includes(r.status)
                  : tab === 'completed'
                    ? terminal.has(r.status)
                    : r.actions.length > 0))
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return pageOf(rows, ctx.query);
    },
  },
  {
    method: 'GET',
    path: '/returns/options',
    access: { capability: 'HANDLE_RETURNS' },
    handle: (ctx) => options(ctx, ctx.query.get('orderId') ?? ''),
  },
  {
    method: 'POST',
    path: '/returns/preview',
    access: { capability: 'HANDLE_RETURNS' },
    handle: (ctx) => preview(ctx, ReturnPreviewRequest.parse(ctx.body)),
  },
  {
    method: 'POST',
    path: '/returns',
    access: { capability: 'HANDLE_RETURNS' },
    idempotent: true,
    authorize: (ctx) => {
      rawOrder(ctx, ReturnCreateRequest.parse(ctx.body).orderId);
    },
    handle: (ctx) => {
      const request = ReturnCreateRequest.parse(ctx.body);
      const offered = validateItems(ctx, request);
      if (request.version !== offered.version) throw fail('RETURN_QUANTITY_CHANGED');
      const reason = offered.reasons.find((r) => r.code === request.reason);
      if (!reason || (reason.noteRequired && !request.note?.trim()))
        throw invalid('note', 'A reason note is required');
      if (reason.evidenceRequired && !request.evidenceIds?.length) throw fail('EVIDENCE_REQUIRED');
      const evidence = (request.evidenceIds ?? []).map((id) =>
        editorMockUpload(ctx, id, { kind: 'order', id: request.orderId }, 'return_evidence')
      );
      if (request.labelUploadId)
        editorMockUpload(
          ctx,
          request.labelUploadId,
          { kind: 'order', id: request.orderId },
          'return_label'
        );
      const result = preview(ctx, request);
      const order = rawOrder(ctx, request.orderId);
      const created = result.parcels.map((parcel) => {
        const owner = order.consignments.find((p) =>
          p.lineIndexes.includes(parcel.items[0]!.index)
        )!.vendorId;
        const id = `ret_${next++}`;
        const data: ReturnCase = {
          id,
          number: `R${1000 + next}`,
          orderId: order.id,
          orderNumber: order.number,
          status: 'requested',
          refundStatus: 'none',
          customerName: order.customer?.name,
          vendorName: owner ? VENDORS[owner]?.name : undefined,
          itemCount: parcel.items.length,
          createdAt: new Date().toISOString(),
          actions: [],
          version: `return-${next}`,
          reason: request.reason,
          customerNote: request.note,
          returnMethod: request.returnMethod,
          refundPayer: 'platform',
          items: parcel.items.map((i) => {
            const line = order.lines[i.index]!;
            return {
              orderItemIndex: i.index,
              productId: line.productId,
              variantId: line.variantId,
              name: line.name,
              quantityRequested: i.quantity,
              quantityApproved: 0,
              quantityRestocked: 0,
            };
          }),
          evidence,
          estimate: parcel.refund,
          estimatedRefund: parcel.refund.total,
          refunded: money(0, ctx.locale),
          destination: request.refundDestination
            ? {
                ...request.refundDestination,
                accountNumber: request.refundDestination.accountNumber
                  ? `••••${request.refundDestination.accountNumber.slice(-4)}`
                  : undefined,
              }
            : undefined,
          shipment: request.labelUploadId ? { labelAvailable: true } : undefined,
          timeline: [
            {
              at: new Date().toISOString(),
              kind: 'created',
              message: 'Return requested',
              by: accountOf(ctx).name,
            },
          ],
          canPreviewRefund: false,
          canOverrideEligibility: false,
        };
        const held = { data, vendorId: owner, labelId: request.labelUploadId };
        cases.set(id, held);
        registerMockUploadTarget({ target: { kind: 'return', id }, vendorIds: [owner] });
        return dto(ctx, held);
      });
      order.updatedAt = new Date().toISOString();
      const ids = created.map((r) => r.id);
      return {
        operation: operation(
          ctx,
          'returns.create',
          ids.map((id) => ({ kind: 'return', id })),
          (c) => {
            requireCapability(c, 'HANDLE_RETURNS');
            for (const id of ids) caseOf(c, id);
          }
        ),
        returns: created,
      };
    },
  },
  {
    method: 'POST',
    path: /^\/returns\/([^/]+)\/actions$/,
    access: { capability: 'HANDLE_RETURNS' },
    idempotent: true,
    authorize: (ctx) => {
      caseOf(ctx, ctx.path.split('/')[2]!);
    },
    handle: (ctx, [id]) => {
      const held = caseOf(ctx, id!);
      const row = structuredClone(held.data);
      const staged = { ...held, data: row };
      const request = ReturnActionRequest.parse(ctx.body);
      if (request.version !== row.version) throw fail('RETURN_STATE_CHANGED');
      if (!actions(ctx, row).includes(request.action)) throw fail('RETURN_ACTION_NOT_ALLOWED');
      const each = (
        items: { index: number; quantity: number }[],
        change: (line: ReturnCase['items'][number], quantity: number) => void
      ) => {
        const seen = new Set<number>();
        for (const item of items) {
          const line = row.items.find((i) => i.orderItemIndex === item.index);
          if (!line || seen.has(item.index)) throw fail('RETURN_ITEM_LISTED_TWICE');
          seen.add(item.index);
          change(line, item.quantity);
        }
      };
      switch (request.action) {
        case 'approve':
          each(request.approvedItems ?? [], (line, qty) => {
            if (qty > line.quantityRequested) throw fail('RETURN_QUANTITY_CHANGED');
            line.quantityApproved = qty;
          });
          if (!row.items.some((i) => i.quantityApproved)) throw fail('RETURN_NOT_ELIGIBLE');
          row.returnMethod = request.returnMethod ?? row.returnMethod;
          if (request.locationId)
            row.returnTo = {
              name: LOCATIONS[location(ctx, held, request.locationId)]!.name,
              address: 'Warehouse receiving desk',
              locationId: request.locationId,
            };
          if (request.labelUploadId) {
            editorMockUpload(
              ctx,
              request.labelUploadId,
              { kind: 'return', id: id! },
              'return_label'
            );
            staged.labelId = request.labelUploadId;
            row.shipment = { labelAvailable: true };
          }
          row.status = 'approved';
          break;
        case 'reject':
          if (!request.reason?.trim()) throw invalid('reason', 'A rejection reason is required');
          row.rejectionReason = request.reason;
          row.status = 'rejected';
          break;
        case 'cancel':
          row.status = 'cancelled';
          break;
        case 'record_receipt':
          each(request.receivedItems ?? [], (line, qty) => {
            const received = request.receivedItems!.find((i) => i.index === line.orderItemIndex)!;
            if (
              qty > line.quantityApproved ||
              qty < line.quantityRestocked + (line.quantityWrittenOff ?? 0) ||
              (line.quantityRestocked + (line.quantityWrittenOff ?? 0) > 0 &&
                received.condition !== line.condition)
            )
              throw fail('RETURN_QUANTITY_CHANGED');
            line.quantityReceived = qty;
            line.condition = received.condition;
          });
          row.status = 'received';
          break;
        case 'restock':
          if (!request.restockItems?.length) throw invalid('restockItems', 'Select received units');
          applyStock(ctx, staged, request.restockItems, request.locationId);
          break;
        case 'record_disposition':
          if (!request.dispositions?.length) throw invalid('dispositions', 'Select received units');
          applyStock(ctx, staged, request.dispositions, request.locationId);
          break;
        case 'record_tracking':
          row.shipment = {
            ...row.shipment,
            labelAvailable: row.shipment?.labelAvailable ?? false,
            carrier: request.carrier,
            trackingNumber: request.trackingNumber,
          };
          row.status = 'in_transit';
          break;
        case 'close':
          row.status = 'closed';
          break;
        case 'record_settlement':
          requireCapability(ctx, 'RECORD_REFUND_SETTLEMENT');
          if (!request.settlement?.method) throw fail('SETTLEMENT_NOT_ALLOWED');
          row.refundStatus = 'succeeded';
          row.settlement = { ...request.settlement, settledAt: new Date().toISOString() };
          for (const receipt of receipts.values())
            if (receipt.target.kind === 'return' && receipt.target.id === id) {
              if (receipt.data.settlementStatus === 'manual_required') {
                const order = rawOrder(ctx, row.orderId);
                order.refunded = (order.refunded ?? 0) + receipt.data.amount.amount;
                order.paymentStatus = 'partially_refunded';
                order.updatedAt = new Date().toISOString();
              }
              receipt.data.settlementStatus = 'succeeded';
              receipt.data.return = row;
            }
          break;
      }
      row.adminNote = request.note ?? row.adminNote;
      row.version = `return-${Date.now()}-${next++}`;
      row.timeline.push({
        at: new Date().toISOString(),
        kind: request.action,
        message: request.action,
        by: accountOf(ctx).name,
      });
      cases.set(id!, staged);
      const result = dto(ctx, staged);
      return {
        operation: operation(ctx, 'returns.action', [{ kind: 'return', id: id! }], (c) => {
          requireCapability(c, 'HANDLE_RETURNS');
          caseOf(c, id!);
        }),
        return: result,
      };
    },
  },
  {
    method: 'GET',
    path: /^\/returns\/([^/]+)\/evidence\/([^/]+)$/,
    access: { capability: 'VIEW_RETURNS' },
    handle: (ctx, [id, uploadId]) => {
      const row = caseOf(ctx, id!);
      const upload = row.data.evidence.find((u) => u.id === uploadId);
      if (!upload) throw new MockError(404, 'NOT_FOUND', 'Evidence not found');
      return {
        id: upload.id,
        url: `${MOCK_ORIGIN}/private/${encodeURIComponent(id!)}/${encodeURIComponent(upload.id)}?token=${next++}`,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
    },
  },
  {
    method: 'GET',
    path: /^\/returns\/([^/]+)\/label$/,
    access: { capability: 'VIEW_RETURNS' },
    handle: (ctx, [id]) => {
      const row = caseOf(ctx, id!);
      if (!row.labelId) throw new MockError(404, 'NOT_FOUND', 'Label not found');
      return {
        id: row.labelId,
        url: `${MOCK_ORIGIN}/private/${encodeURIComponent(id!)}/label?token=${next++}`,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      };
    },
  },
  {
    method: 'GET',
    path: /^\/returns\/([^/]+)$/,
    access: { capability: 'VIEW_RETURNS' },
    handle: (ctx, [id]) => {
      seed(ctx);
      return dto(ctx, caseOf(ctx, id!));
    },
  },
  {
    method: 'POST',
    path: '/refunds/preview',
    access: { capability: 'ISSUE_REFUNDS' },
    handle: (ctx) => refundQuote(ctx, RefundPreviewRequest.parse(ctx.body)),
  },
  {
    method: 'POST',
    path: '/refunds/execute',
    access: { capability: 'ISSUE_REFUNDS' },
    idempotent: true,
    authorize: (ctx) => {
      const request = RefundExecuteRequest.parse(ctx.body);
      if (request.preview.target.kind === 'return') caseOf(ctx, request.preview.target.id);
      else rawOrder(ctx, request.preview.target.id);
    },
    handle: (ctx) => {
      const request = RefundExecuteRequest.parse(ctx.body);
      const held = quotes.get(request.previewToken);
      if (
        !held ||
        held.actor !== accountOf(ctx).id ||
        held.workspace !== grantOf(ctx).workspace ||
        Date.parse(held.data.expiresAt) <= Date.now()
      )
        throw fail('REFUND_PREVIEW_EXPIRED');
      if (JSON.stringify(held.request) !== JSON.stringify(request.preview))
        throw fail('REFUND_PREVIEW_CHANGED');
      const row =
        request.preview.target.kind === 'return'
          ? caseOf(ctx, request.preview.target.id)
          : undefined;
      const order = rawOrder(ctx, row?.data.orderId ?? request.preview.target.id);
      if (held.data.version !== (row?.data.version ?? order.updatedAt))
        throw fail('REFUND_PREVIEW_CHANGED');
      refundQuote(ctx, request.preview); // Recheck authorization, quantities and collected money before any effect.
      const status =
        nextSettlement ??
        (held.data.destination.settlementRequired ? 'manual_required' : 'succeeded');
      nextSettlement = undefined;
      if (status === 'succeeded' && row && request.preview.restoreInventory)
        applyStock(ctx, row, held.data.stock, request.preview.locationId);
      if (status === 'succeeded') {
        order.refunded = (order.refunded ?? 0) + held.data.amount.amount;
        order.paymentStatus = held.data.resultingPaymentStatus;
        order.updatedAt = new Date().toISOString();
      }
      if (row) {
        row.data.refundStatus = status;
        if (status !== 'failed')
          row.data.refunded = money(row.data.refunded.amount + held.data.amount.amount, ctx.locale);
        row.data.version = `return-${Date.now()}-${next++}`;
        if (request.preview.settlement) row.data.settlement = request.preview.settlement;
      }
      const id = `refund_${next++}`;
      const target = request.preview.target;
      const op = operation(
        ctx,
        'refunds.execute',
        [
          { kind: 'refund', id },
          { kind: 'order', id: order.id },
          ...(row ? [{ kind: 'return' as const, id: row.data.id }] : []),
        ],
        (c) => {
          requireCapability(c, 'ISSUE_REFUNDS');
          if (target.kind === 'return') caseOf(c, target.id);
          else rawOrder(c, target.id);
        }
      );
      const data: RefundResult = {
        operation: op,
        refundId: id,
        settlementStatus: status,
        amount: held.data.amount,
        order: mockOrderDetail(ctx, order.id),
        return: row ? dto(ctx, row) : undefined,
        warnings: [],
      };
      receipts.set(id, {
        data,
        actor: accountOf(ctx).id,
        workspace: grantOf(ctx).workspace,
        target,
      });
      return data;
    },
  },
  {
    method: 'GET',
    path: /^\/refunds\/([^/]+)$/,
    access: { capability: 'VIEW_RETURNS' },
    handle: (ctx, [id]) => {
      const receipt = receipts.get(id!);
      if (!receipt || receipt.workspace !== grantOf(ctx).workspace)
        throw new MockError(404, 'NOT_FOUND', 'Refund not found');
      const target = receipt.target;
      const row = target.kind === 'return' ? caseOf(ctx, target.id) : undefined;
      const order = rawOrder(ctx, row?.data.orderId ?? target.id);
      return {
        ...receipt.data,
        order: mockOrderDetail(ctx, order.id),
        return: row ? dto(ctx, row) : undefined,
      };
    },
  },
];

/**
 * What the shopper picks in "Request a return", kept within what the store
 * allows. The store says which lines can go back and how many of each
 * (`OrderLine.returnableQuantity`); the app offers nothing more.
 */
import { isApiError } from '@/api/errors';
import {
  RETURN_REFUSALS,
  type OrderDetail,
  type OrderLine,
  type ReturnPreviewRequest,
} from '@/contracts/mobile/shop/v1';

/** The quantity chosen of each line, by `OrderLine.index`. A line not chosen is left out. */
export type ReturnSelection = Readonly<Record<number, number>>;

function returnable(line: OrderLine): number {
  return Math.max(line.returnableQuantity ?? 0, 0);
}

/** The lines the store marks returnable now: at least one of each can still go back. */
export function returnableLines(order: OrderDetail): OrderLine[] {
  return order.lines.filter((line) => returnable(line) > 0);
}

/** A quantity asked for a line, kept between one and what can still be returned. */
export function clampQuantity(line: OrderLine, quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), 1), returnable(line));
}

/** Ticks a line (one of it) or unticks it. A line that cannot be returned stays out. */
export function toggleLine(
  selection: ReturnSelection,
  line: OrderLine,
  chosen: boolean
): ReturnSelection {
  const rest: ReturnSelection = Object.fromEntries(
    Object.entries(selection).filter(([index]) => Number(index) !== line.index)
  );
  return chosen && returnable(line) > 0 ? { ...rest, [line.index]: 1 } : rest;
}

/** Changes how many of a chosen line go back, never past what the store allows. */
export function setQuantity(
  selection: ReturnSelection,
  line: OrderLine,
  quantity: number
): ReturnSelection {
  if (selection[line.index] === undefined || returnable(line) === 0) return selection;
  return { ...selection, [line.index]: clampQuantity(line, quantity) };
}

/** The lines to send, in the order's order: only returnable lines, each within its quantity. */
export function selectedLines(
  order: OrderDetail,
  selection: ReturnSelection
): ReturnPreviewRequest['lines'] {
  return returnableLines(order).flatMap((line) => {
    const quantity = selection[line.index];
    return quantity === undefined
      ? []
      : [{ index: line.index, quantity: clampQuantity(line, quantity) }];
  });
}

/** The preview to ask for: none until a line and a reason are chosen. */
export function previewRequest(
  order: OrderDetail,
  selection: ReturnSelection,
  reason: string | undefined
): ReturnPreviewRequest | null {
  const lines = selectedLines(order, selection);
  return lines.length > 0 && reason ? { lines, reason } : null;
}

/**
 * How the app answers a refusal of the store. RETURNS_THROUGH_STORE sends the
 * shopper to the store instead; every other refusal of a return is shown in
 * the store's own words. Anything else is an ordinary error.
 */
export type ReturnRefusalView =
  { kind: 'contact'; message?: string } | { kind: 'message'; message: string } | { kind: 'error' };

const REFUSALS: readonly string[] = RETURN_REFUSALS;

export function describeRefusal(error: unknown): ReturnRefusalView {
  if (!isApiError(error) || !error.reason || !REFUSALS.includes(error.reason)) {
    return { kind: 'error' };
  }
  if (error.reason === 'RETURNS_THROUGH_STORE') {
    return { kind: 'contact', message: error.message || undefined };
  }
  return error.message ? { kind: 'message', message: error.message } : { kind: 'error' };
}

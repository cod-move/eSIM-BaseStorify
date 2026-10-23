import { ApiError } from '@/api/errors';
import {
  clampQuantity,
  describeRefusal,
  previewRequest,
  returnableLines,
  setQuantity,
  toggleLine,
} from '@/features/returns/return-selection';

import { line, order } from './order';

describe('what the return flow offers', () => {
  it('offers only the lines the store marks returnable', () => {
    const placed = order([line(0, 3, 2), line(1, 1, 0), line(2, 1)]);

    expect(returnableLines(placed).map((offered) => offered.index)).toEqual([0]);
    // A line the store does not offer cannot be ticked, nor sent.
    expect(toggleLine({}, line(1, 1, 0), true)).toEqual({});
    expect(previewRequest(placed, { 1: 1, 2: 1 }, 'changed_mind')).toBeNull();
  });

  it('never lets a quantity pass returnableQuantity', () => {
    const tees = line(0, 3, 2);
    let selection = toggleLine({}, tees, true);
    expect(selection).toEqual({ 0: 1 });

    selection = setQuantity(selection, tees, 5);
    expect(selection).toEqual({ 0: 2 });
    expect(clampQuantity(tees, 0)).toBe(1);
    // Even a selection made by hand is sent within what the store allows.
    expect(previewRequest(order([tees]), { 0: 9 }, 'other')).toEqual({
      lines: [{ index: 0, quantity: 2 }],
      reason: 'other',
    });
  });

  it('asks for no preview until a line and a reason are chosen', () => {
    const placed = order([line(0, 1, 1)]);
    expect(previewRequest(placed, {}, 'other')).toBeNull();
    expect(previewRequest(placed, { 0: 1 }, undefined)).toBeNull();
  });
});

describe('a refusal of the store', () => {
  it('sends the shopper to the store on RETURNS_THROUGH_STORE', () => {
    const error = new ApiError(409, 'CONFLICT', 'Returns go through our team.', {
      reason: 'RETURNS_THROUGH_STORE',
    });
    expect(describeRefusal(error)).toEqual({
      kind: 'contact',
      message: 'Returns go through our team.',
    });
  });

  it("shows any other refusal in the store's words", () => {
    const error = new ApiError(409, 'CONFLICT', 'Only 1 of this item can still be returned.', {
      reason: 'QUANTITY_EXCEEDS',
      details: { index: 0, returnable: 1 },
    });
    expect(describeRefusal(error)).toEqual({
      kind: 'message',
      message: 'Only 1 of this item can still be returned.',
    });
    expect(describeRefusal(new ApiError(500, 'INTERNAL_ERROR', 'Boom'))).toEqual({
      kind: 'error',
    });
  });
});

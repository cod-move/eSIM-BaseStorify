import assert from "node:assert/strict";
import { test } from "node:test";
import { isPaymentFeeLine, paymentFeeIn, withoutPaymentFee } from "../fee-display";

const goods = { price: 4.5, quantity: 2 };
const fee = { price: 0.59, quantity: 1, lineAttributes: { paymentFee: { method: "card", fee: 59 } } };

test("a fee line is told by its attributes", () => {
  assert.equal(isPaymentFeeLine(fee), true);
  assert.equal(isPaymentFeeLine({ lineAttributes: { paymentFee: true } }), true);
  assert.equal(isPaymentFeeLine(goods), false);
  assert.equal(isPaymentFeeLine({ lineAttributes: { days: 3 } }), false);
  assert.equal(isPaymentFeeLine(undefined), false);
});

test("the fee among the lines, in units", () => {
  assert.equal(paymentFeeIn([goods, fee]), 0.59);
  assert.equal(paymentFeeIn([goods]), 0);
  assert.equal(paymentFeeIn(undefined), 0);
});

test("a cart view loses its fee line, its count and its amount", () => {
  const view = { lines: [{ item: goods }, { item: fee }], totalItems: 3, subtotal: 9.59, other: "kept" };
  assert.deepEqual(withoutPaymentFee(view), { lines: [{ item: goods }], totalItems: 2, subtotal: 9, other: "kept" });
  const plain = { lines: [{ item: goods }], totalItems: 2, subtotal: 9 };
  assert.equal(withoutPaymentFee(plain), plain);
});

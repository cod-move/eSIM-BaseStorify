/**
 * Check of payment fees (patch P29) against a development database. Nothing
 * is bought or charged.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-fees.ts
 *
 * The cart gets one "Payment fee" line for a method that charges one, priced
 * from the other lines; choosing again changes nothing; the balance, a method
 * without a fee and a wallet top-up carry none; the checkout pricing prices the
 * line from the other lines whatever it says. Puts the fee settings back and
 * removes what it made. Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart, Product } from "@/models";
import { getEsimSettings } from "@/models/esim-pricing.model";

const { ObjectId } = mongoose.Types;
const sessionId = `e2e-fees-${Date.now()}`;

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

const line = (name: string, price: number, variantId = new ObjectId(), productId = new ObjectId()) => ({
  _id: new ObjectId(),
  productId,
  variantId,
  quantity: 1,
  price,
  name,
});

async function cartLines() {
  const cart = await Cart.findOne({ sessionId }).lean<{ items: Array<{ name: string; price: number; variantName?: string }> } | null>();
  return (cart?.items ?? []).map((item) => [item.name, item.price, item.variantName ?? ""]);
}

async function run() {
  const { syncPaymentFeeLine, findPaymentFeeProduct } = await import("@/lib/esim/payments/fee-line");
  const { esimLinePrices } = await import("@/lib/esim/cart");
  const { findWalletProduct } = await import("@/lib/esim/wallet/product");
  const settings = await getEsimSettings();
  settings.set("paymentFees", [{ method: "card", fixedMinor: 30, percent: 3 }]);
  await settings.save();

  const goods = line("Test eSIM", 4.5);
  await Cart.collection.insertOne({ sessionId, items: [goods], createdAt: new Date(), updatedAt: new Date() });

  console.log("1. a card adds one fee line: 3% of 4.50 + 0.30");
  assert.deepEqual(await syncPaymentFeeLine({ sessionId }, "card"), { changed: true, feeMinor: 44 });
  assert.deepEqual(await cartLines(), [["Test eSIM", 4.5, ""], ["Payment fee", 0.44, "Card"]]);
  assert.deepEqual(await syncPaymentFeeLine({ sessionId }, "card"), { changed: false, feeMinor: 44 });

  console.log("2. the checkout prices the line from the other lines, whatever it says");
  const product = await findPaymentFeeProduct();
  assert.ok(product);
  const items = [
    { ...goods, price: 9 },
    { variantId: new ObjectId(product.variantId), price: 0.01, quantity: 1, lineAttributes: { paymentFee: { method: "card", fee: 1 } } },
  ];
  const prices = await esimLinePrices(items);
  assert.equal(prices.get(items[1]), 0.57); // 3% of 9.00 = 0.27, + 0.30
  await assert.rejects(esimLinePrices([goods, { ...items[1], quantity: 2 }]), (error: { errors?: { stock?: string[] } }) =>
    /out of date/.test(error.errors?.stock?.[0] ?? ""),
  );

  console.log("3. the balance and a method with no fee remove it");
  assert.deepEqual(await syncPaymentFeeLine({ sessionId }, "store_credit"), { changed: true, feeMinor: 0 });
  assert.equal((await cartLines()).length, 1);
  assert.deepEqual(await syncPaymentFeeLine({ sessionId }, "paypal"), { changed: false, feeMinor: 0 });
  await syncPaymentFeeLine({ sessionId }, "card");
  assert.deepEqual(await syncPaymentFeeLine({ sessionId }, "paypal"), { changed: true, feeMinor: 0 });

  console.log("4. a wallet top-up carries none");
  const wallet = await findWalletProduct();
  if (wallet) {
    await Cart.updateOne({ sessionId }, { $set: { items: [line("Wallet top-up", 20, new ObjectId(wallet.variantId), new ObjectId(wallet.productId))] } });
    assert.deepEqual(await syncPaymentFeeLine({ sessionId }, "card"), { changed: false, feeMinor: 0 });
  }
  console.log("All payment fee checks passed.");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const settings = await getEsimSettings();
  const savedFees = JSON.parse(JSON.stringify(settings.paymentFees ?? []));
  const hadProduct = Boolean(settings.paymentFeeProductId);
  const before = await counts();
  try {
    await run();
  } finally {
    await Cart.collection.deleteMany({ sessionId });
    const after = await getEsimSettings();
    after.set("paymentFees", savedFees);
    if (!hadProduct && after.paymentFeeProductId) {
      await Product.collection.deleteOne({ _id: after.paymentFeeProductId });
      after.set("paymentFeeProductId", null);
    }
    await after.save();
    const end = await counts();
    // Making the fee product writes inventory history, on purpose.
    const kept = new Set(["audit_logs", "notifications", "inventorymovements", "inventory_movements"]);
    const changed = [...end].filter(([name, count]) => !kept.has(name) && (before.get(name) ?? 0) !== count);
    console.log(changed.length ? `Collections changed: ${JSON.stringify(changed)}` : "Cleanup left every collection as it was.");
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

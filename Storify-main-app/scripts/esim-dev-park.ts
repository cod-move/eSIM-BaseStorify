/**
 * Check of setting the cart aside for a balance top-up (WAL-01, patch P27)
 * against a development database. Nothing is bought.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-park.ts
 *
 * The cart's lines go aside and the top-up stays; nothing comes back while the
 * top-up is still in the cart; they come back once it is gone, never doubled,
 * and a second set-aside does not double what is already waiting. Removes what
 * it made and reports any collection whose count changed. Refuses to run with
 * NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB, mongoose } from "@/lib/db";
import { Cart } from "@/models";
import { EsimParkedCart } from "@/models/esim-parked-cart.model";

const { ObjectId } = mongoose.Types;
const userId = new ObjectId();

async function counts() {
  const db = mongoose.connection.db!;
  const names = (await db.listCollections().toArray()).map((collection) => collection.name).sort();
  return new Map(await Promise.all(names.map(async (name) => [name, await db.collection(name).countDocuments()] as const)));
}

const line = (name: string, variantId = new ObjectId()) => ({
  _id: new ObjectId(),
  productId: new ObjectId(),
  variantId,
  quantity: 1,
  price: 4.5,
  name,
  lineAttributes: { days: 3 },
});

async function cartNames() {
  const cart = await Cart.findOne({ userId }).lean<{ items: Array<{ name: string }> } | null>();
  return (cart?.items ?? []).map((item) => item.name).sort();
}

async function run() {
  const { parkCartForTopup, restoreParkedCart, parkedLineCount, isWalletCart } = await import("@/lib/esim/wallet/park");
  const { findWalletProduct } = await import("@/lib/esim/wallet/product");
  const wallet = await findWalletProduct();
  assert.ok(wallet, "the dev database needs the wallet product (publish the catalogue once)");
  const topup = { ...line("Wallet top-up", new ObjectId(wallet.variantId)), productId: new ObjectId(wallet.productId) };
  const a = line("eSIM A");
  const b = line("eSIM B");
  await Cart.collection.insertOne({ userId, items: [a, b, topup], createdAt: new Date(), updatedAt: new Date() });

  console.log("1. the other lines go aside; the top-up stays");
  assert.equal(await parkCartForTopup(String(userId)), 2);
  assert.deepEqual(await cartNames(), ["Wallet top-up"]);
  assert.equal(await parkedLineCount(String(userId)), 2);
  assert.equal(await isWalletCart([{ variantId: topup.variantId }]), true);
  assert.equal(await isWalletCart([{ variantId: a.variantId }]), false);

  console.log("2. nothing comes back while the top-up is in the cart");
  assert.equal(await restoreParkedCart(String(userId)), 0);
  assert.equal(await parkedLineCount(String(userId)), 2);

  console.log("3. once it is gone they come back, and only once");
  await Cart.updateOne({ userId }, { $set: { items: [a] } });
  assert.equal(await restoreParkedCart(String(userId)), 1);
  assert.deepEqual(await cartNames(), ["eSIM A", "eSIM B"]);
  assert.equal(await parkedLineCount(String(userId)), 0);
  assert.equal(await restoreParkedCart(String(userId)), 0);

  console.log("4. setting aside twice does not double what waits");
  await parkCartForTopup(String(userId));
  await Cart.updateOne({ userId }, { $push: { items: a } });
  await parkCartForTopup(String(userId));
  assert.equal(await parkedLineCount(String(userId)), 2);
  assert.equal(await restoreParkedCart(String(userId)), 2);
  assert.deepEqual(await cartNames(), ["eSIM A", "eSIM B"]);
  console.log("All set-aside checks passed.");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const before = await counts();
  try {
    await run();
  } finally {
    await Cart.collection.deleteMany({ userId });
    await EsimParkedCart.deleteMany({ user: userId });
    const after = await counts();
    const changed = [...after].filter(([name, count]) => (before.get(name) ?? 0) !== count);
    console.log(changed.length ? `Collections changed: ${JSON.stringify(changed)}` : "Cleanup left every collection as it was.");
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Removes the BNESIM product catalogue kept on BNESIM eSIMs (`raw`).
 *
 * Until the BNESIM adapter asked for a card with `with_products=0`, every
 * card answer carried BNESIM's whole catalogue (about 1.7 MB) as `products`,
 * and it was stored with the eSIM: at fulfilment (`raw.products`), and at
 * each refresh (`raw.latest.usage.products`, `raw.latest.esim.products`;
 * `raw.order.products` once the first answer moved under `order`). It is
 * the catalogue, not the card's own plans, so nothing reads it.
 *
 * Dry run unless --apply; safe to run again.
 *
 *   pnpm exec tsx --env-file-if-exists=.env scripts/esim-strip-bnesim-catalogue.ts [--apply]
 */
import { connectDB, disconnectDB } from "@/lib/db";
import { EsimProfile } from "@/models/esim-profile.model";

const PATHS = ["raw.products", "raw.order.products", "raw.latest.usage.products", "raw.latest.esim.products"];

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();
  try {
    const carrying = { providerCode: "bnesim", $or: PATHS.map((path) => ({ [path]: { $exists: true } })) };
    const total = await EsimProfile.countDocuments({ providerCode: "bnesim" });
    const affected = await EsimProfile.countDocuments(carrying);
    console.log(`${apply ? "APPLY" : "DRY RUN"}: ${affected} of ${total} BNESIM eSIM(s) keep the catalogue`);
    for (const path of PATHS) {
      console.log(`  ${path}: ${await EsimProfile.countDocuments({ providerCode: "bnesim", [path]: { $exists: true } })}`);
    }
    if (!apply) {
      console.log("Nothing changed. Run again with --apply to remove it.");
      return;
    }
    const result = await EsimProfile.updateMany(carrying, { $unset: Object.fromEntries(PATHS.map((path) => [path, ""])) });
    console.log(`removed from ${result.modifiedCount} eSIM(s)`);
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

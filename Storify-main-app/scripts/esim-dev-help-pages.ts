/**
 * Creates the eSIM help pages (WEB-35) in a development database, or removes
 * them again with --remove. The admin's Devices page does the same with one
 * click; this is for checking it end to end.
 *
 *   pnpm exec tsx --env-file-if-exists=.env --require ./scripts/lib/finance-cli.cjs \
 *     scripts/esim-dev-help-pages.ts [--remove]
 *
 * Refuses to run with NODE_ENV=production.
 */
import assert from "node:assert/strict";
import { connectDB, disconnectDB } from "@/lib/db";
import { buildLandingKey } from "@/lib/storefront/pages/handles";
import { StorePage } from "@/models/store-page.model";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run against production");
  await connectDB();
  const { HELP_PAGES, createHelpPages, helpPagesState } = await import("@/lib/esim/admin/help-pages");
  const keys = HELP_PAGES.map((page) => buildLandingKey(page.handle));
  if (process.argv.includes("--remove")) {
    const removed = await StorePage.deleteMany({ key: { $in: keys } });
    console.log(`Removed ${removed.deletedCount} help pages.`);
    return;
  }
  const existed = (await helpPagesState()).filter((page) => page.exists).map((page) => page.handle);
  const first = await createHelpPages("dev-script");
  assert.deepEqual(first.created.sort(), HELP_PAGES.map((page) => page.handle).filter((handle) => !existed.includes(handle)).sort());
  const second = await createHelpPages("dev-script");
  assert.deepEqual(second.created, [], "a second run creates nothing");
  const state = await helpPagesState();
  assert.ok(state.every((page) => page.exists && page.published));
  const doc = await StorePage.findOne({ key: keys[0] }).lean<{ published: { sections: Array<{ type: string }> } }>();
  assert.deepEqual(doc!.published.sections.map((section) => section.type), ["esim-device-check", "faq"]);
  console.log(`Help pages ready: ${state.map((page) => `/pages/${page.handle}`).join(", ")} (created now: ${first.created.join(", ") || "none"}).`);
}

main()
  .catch((error) => {
    console.error("FAILED:", error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());

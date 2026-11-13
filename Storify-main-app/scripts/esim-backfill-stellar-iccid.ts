/**
 * Gives Stellar eSIM profiles with no `iccid` the ICCID their stored supplier
 * answers (`raw`) name. Dry run unless --apply; safe to run again.
 *
 *   pnpm exec tsx --env-file-if-exists=.env scripts/esim-backfill-stellar-iccid.ts [--apply]
 *
 * Skipped and reported: an ICCID already on another profile, one read by
 * more than one profile, and a raw naming two different ICCIDs.
 */
import { connectDB, disconnectDB } from "@/lib/db";
import { backfillStellarIccids } from "@/lib/esim/account/iccid-backfill";

const mask = (iccid: string) => `${iccid.slice(0, 6)}…${iccid.slice(-4)}`;

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();
  try {
    const report = await backfillStellarIccids({ dryRun: !apply });
    console.log(`${apply ? "APPLY" : "DRY RUN"}: ${report.scanned} Stellar eSIM(s) without an ICCID`);
    for (const row of report.apply) console.log(`  set    ${row.id} → ${mask(row.iccid)}`);
    for (const row of report.taken) console.log(`  taken  ${row.id} → ${mask(row.iccid)} already on ${row.holder}`);
    for (const row of report.shared) console.log(`  shared ${row.id} → ${mask(row.iccid)} read by several profiles`);
    for (const id of report.conflicting) console.log(`  conflicting ICCIDs in raw: ${id}`);
    console.log(
      `would set ${report.apply.length}, taken ${report.taken.length}, shared ${report.shared.length}, ` +
        `conflicting ${report.conflicting.length}${apply ? `; written ${report.written}` : ""}`,
    );
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

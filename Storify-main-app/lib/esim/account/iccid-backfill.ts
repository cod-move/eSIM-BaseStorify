import { mongoose } from "@/lib/db";
import { EsimProfile } from "@/models/esim-profile.model";
import { iccidFromStellarRaw, planIccidBackfill, type BackfillCandidate, type BackfillPlan } from "./profile-iccid";

const STELLAR = "stellar";

/**
 * Gives a profile the ICCID its supplier just reported, when it has none and
 * no other profile holds it. Conditional on `iccid: null`, so repeating it
 * (or racing the backfill) changes nothing. True when it was written.
 */
export async function fillMissingIccid(profileId: mongoose.Types.ObjectId, iccid: string | null): Promise<boolean> {
  if (!iccid) return false;
  const holder = await EsimProfile.findOne({ iccid, _id: { $ne: profileId } }).select("_id").lean();
  if (holder) {
    console.warn(`[esim] ICCID reported for eSIM ${String(profileId)} is already on ${String(holder._id)}; left unset`);
    return false;
  }
  const result = await EsimProfile.updateOne({ _id: profileId, iccid: null }, { $set: { iccid } });
  return result.modifiedCount === 1;
}

export interface StellarIccidBackfillReport extends BackfillPlan {
  scanned: number;
  /** raw named more than one ICCID: left alone. */
  conflicting: string[];
  written: number;
}

/**
 * Stellar profiles with no `iccid` whose stored supplier answers (`raw`) name
 * one get it (MIG / fulfilment backfill). Idempotent: only `iccid: null`
 * profiles are read and written; a dry run reports without writing.
 */
export async function backfillStellarIccids({ dryRun }: { dryRun: boolean }): Promise<StellarIccidBackfillReport> {
  const rows = await EsimProfile.find({ providerCode: STELLAR, iccid: null })
    .select({ raw: 1 })
    .lean<Array<{ _id: unknown; raw?: unknown }>>();
  const candidates: BackfillCandidate[] = [];
  const conflicting: string[] = [];
  for (const row of rows) {
    const read = iccidFromStellarRaw(row.raw);
    if (read.iccid) candidates.push({ id: String(row._id), iccid: read.iccid });
    else if (read.conflict) conflicting.push(String(row._id));
  }
  const held = candidates.length
    ? await EsimProfile.find({ iccid: { $in: [...new Set(candidates.map((c) => c.iccid))] } })
        .select("_id iccid")
        .lean<Array<{ _id: unknown; iccid: string }>>()
    : [];
  const plan = planIccidBackfill(candidates, new Map(held.map((row) => [row.iccid, String(row._id)])));

  let written = 0;
  if (!dryRun) {
    for (const candidate of plan.apply) {
      const result = await EsimProfile.updateOne({ _id: candidate.id, iccid: null }, { $set: { iccid: candidate.iccid } });
      written += result.modifiedCount;
    }
  }
  return { scanned: rows.length, conflicting, written, ...plan };
}

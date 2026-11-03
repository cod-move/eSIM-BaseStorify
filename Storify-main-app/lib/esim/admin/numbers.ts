import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimNumber, type EsimNumberStatus } from "@/models/esim-number.model";
import { ensureNumberProduct } from "@/lib/esim/numbers/product";
import { parseNumberImport, type NumberImportOptions, type NumberImportProblem } from "@/lib/esim/numbers/import";

/**
 * Admin → eSIM → Numbers (NUM-01): the number-card stock. Import a batch as
 * TopConnect delivers it, see which numbers are free, held or sold and to
 * whom (search by number, ICCID, batch or the customer's email), change a
 * free number's price, premium or note, take one off sale or put it back.
 * A sold or held number is never edited or removed here.
 */

export const NUMBERS_PAGE_SIZE = 50;

export interface AdminNumberFilters {
  status?: EsimNumberStatus | "all";
  dialCode?: string;
  /** Number, ICCID, batch or customer email. */
  search?: string;
  page?: number;
}

export interface AdminNumber {
  id: string;
  msisdn: string;
  dialCode: string;
  nationalNumber: string;
  country: string | null;
  iccid: string;
  priceMinor: number;
  premiumMinor: number;
  status: EsimNumberStatus;
  customer: string | null;
  reservedUntil: string | null;
  soldAt: string | null;
  batch: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminNumberList {
  rows: AdminNumber[];
  total: number;
  page: number;
  pages: number;
  counts: Record<EsimNumberStatus, number>;
  dialCodes: string[];
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function listNumbersAdmin(filters: AdminNumberFilters): Promise<AdminNumberList> {
  await connectDB();
  const match: Record<string, unknown> = {};
  if (filters.status && filters.status !== "all") match.status = filters.status;
  if (filters.dialCode && /^\d{1,4}$/.test(filters.dialCode)) match.dialCode = filters.dialCode;
  const search = filters.search?.trim();
  if (search) {
    if (search.includes("@")) {
      const users = await User.find({ email: search.toLowerCase() }).select({ _id: 1 }).lean();
      match.$or = [{ customer: { $in: users.map((user) => user._id) } }, { "reservation.customer": { $in: users.map((user) => user._id) } }];
    } else {
      const digits = search.replace(/[\s()+-]/g, "");
      match.$or = [
        ...(/^\d{3,}$/.test(digits) ? [{ msisdn: new RegExp(escape(digits)) }, { iccid: new RegExp(`^${escape(digits)}`) }] : []),
        { batch: new RegExp(escape(search), "i") },
      ];
    }
  }

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const [rows, total, statusRows, dialCodes] = await Promise.all([
    EsimNumber.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * NUMBERS_PAGE_SIZE)
      .limit(NUMBERS_PAGE_SIZE)
      .lean(),
    EsimNumber.countDocuments(match),
    EsimNumber.aggregate<{ _id: EsimNumberStatus; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    EsimNumber.distinct("dialCode") as Promise<string[]>,
  ]);

  const customerIds = rows.flatMap((row) => [row.customer, row.reservation?.customer]).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
  const users = customerIds.length
    ? await User.find({ _id: { $in: customerIds } }).select({ email: 1 }).lean<Array<{ _id: mongoose.Types.ObjectId; email: string }>>()
    : [];
  const emailById = new Map(users.map((user) => [String(user._id), user.email]));
  const counts: Record<EsimNumberStatus, number> = { available: 0, reserved: 0, sold: 0, retired: 0 };
  for (const row of statusRows) counts[row._id] = row.count;

  return {
    rows: rows.map((row) => {
      const holder = row.customer ?? row.reservation?.customer ?? null;
      return {
        id: String(row._id),
        msisdn: row.msisdn,
        dialCode: row.dialCode,
        nationalNumber: row.nationalNumber,
        country: row.country,
        iccid: row.iccid,
        priceMinor: row.priceMinor,
        premiumMinor: row.premiumMinor,
        status: row.status,
        customer: holder ? (emailById.get(String(holder)) ?? null) : null,
        reservedUntil: row.reservation?.until ? new Date(row.reservation.until).toISOString() : null,
        soldAt: row.soldAt ? new Date(row.soldAt).toISOString() : null,
        batch: row.batch,
        note: row.note,
        createdAt: new Date(row.createdAt).toISOString(),
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / NUMBERS_PAGE_SIZE)),
    counts,
    dialCodes: dialCodes.sort((a, b) => Number(a) - Number(b)),
  };
}

export interface NumberImportReport {
  imported: number;
  /** Already in stock (same number or ICCID). */
  existing: number;
  problems: NumberImportProblem[];
}

/**
 * Stores a batch. Lines that do not parse are reported, not stored; numbers
 * or ICCIDs already in stock are skipped. With `dryRun` nothing is written:
 * the report is what an import would do.
 */
export async function importNumbers(
  text: string,
  options: NumberImportOptions & { batch?: string | null; dryRun?: boolean },
): Promise<NumberImportReport> {
  await connectDB();
  const { rows, problems } = parseNumberImport(text, options);
  if (!rows.length) return { imported: 0, existing: 0, problems };

  const taken = await EsimNumber.find({
    $or: [{ msisdn: { $in: rows.map((row) => row.msisdn) } }, { iccid: { $in: rows.map((row) => row.iccid) } }],
  })
    .select({ msisdn: 1, iccid: 1 })
    .lean();
  const takenMsisdn = new Set(taken.map((row) => row.msisdn));
  const takenIccid = new Set(taken.map((row) => row.iccid));
  const fresh = rows.filter((row) => !takenMsisdn.has(row.msisdn) && !takenIccid.has(row.iccid));
  if (options.dryRun || !fresh.length) return { imported: options.dryRun ? fresh.length : 0, existing: rows.length - fresh.length, problems };

  const batch = options.batch?.trim() || null;
  let imported = 0;
  try {
    const result = await EsimNumber.insertMany(
      fresh.map((row) => ({
        providerCode: "topconnect",
        msisdn: row.msisdn,
        dialCode: row.dialCode,
        nationalNumber: row.nationalNumber,
        country: row.country,
        iccid: row.iccid,
        install: { lpa: row.lpa, pin1: row.pin1, puk1: row.puk1, pin2: row.pin2, puk2: row.puk2 },
        priceMinor: row.priceMinor,
        premiumMinor: row.premiumMinor,
        status: "available",
        batch,
      })),
      { ordered: false },
    );
    imported = result.length;
  } catch (error) {
    // Another import took some of the same numbers meanwhile: those are "existing".
    const inserted = (error as { insertedDocs?: unknown[] }).insertedDocs;
    if (!Array.isArray(inserted)) throw error;
    imported = inserted.length;
  }
  // Numbers on sale need the hidden product their cart lines use; made here, in the admin's request.
  if (imported) await ensureNumberProduct().catch((error) => console.error("[esim] number product could not be created:", error));
  return { imported, existing: rows.length - imported, problems };
}

export interface NumberUpdate {
  priceMinor?: number;
  premiumMinor?: number;
  note?: string | null;
  /** Off sale and back. */
  status?: "available" | "retired";
}

/** Changes a free (or retired) number; returns what it was and is, for the audit log. */
export async function updateNumber(id: string, update: NumberUpdate) {
  await connectDB();
  if (!mongoose.isValidObjectId(id)) throw new Error("Unknown number");
  const set: Record<string, unknown> = {};
  if (update.priceMinor !== undefined) set.priceMinor = update.priceMinor;
  if (update.premiumMinor !== undefined) set.premiumMinor = update.premiumMinor;
  if (update.note !== undefined) set.note = update.note?.trim() || null;
  if (update.status !== undefined) set.status = update.status;
  const before = await EsimNumber.findOneAndUpdate({ _id: id, status: { $in: ["available", "retired"] } }, { $set: set }).lean();
  if (!before) throw new Error("Only a number that is not sold or held can be changed");
  return {
    msisdn: before.msisdn,
    before: { priceMinor: before.priceMinor, premiumMinor: before.premiumMinor, note: before.note, status: before.status },
    after: set,
  };
}

/** Removes numbers that never sold (a wrong import); sold or held ones stay. */
export async function deleteNumbers(ids: string[]) {
  await connectDB();
  const valid = ids.filter((id) => mongoose.isValidObjectId(id));
  const rows = await EsimNumber.find({ _id: { $in: valid }, status: { $in: ["available", "retired"] }, customer: null }).select({ msisdn: 1 }).lean();
  await EsimNumber.deleteMany({ _id: { $in: rows.map((row) => row._id) }, status: { $in: ["available", "retired"] }, customer: null });
  return rows.map((row) => row.msisdn);
}

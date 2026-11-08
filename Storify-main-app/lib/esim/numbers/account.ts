import "server-only";

import { mongoose } from "@/lib/db";
import { EsimNumber, type IEsimNumber, type NumberCardPackage } from "@/models/esim-number.model";
import { EsimNumberOrder } from "@/models/esim-number-order.model";
import { EsimNumberOp } from "@/models/esim-number-op.model";
import { EsimNumberTransfer } from "@/models/esim-number-transfer.model";
import { formatAmount } from "@/lib/esim/numbers/line";
import { credentialsOf, findProvider } from "@/lib/esim/provider-service";
import { withProviderLog } from "@/lib/esim/provider-log";
import { topConnectClient } from "@/lib/esim/providers/registry";
import { numberValidUntil, parseLpa } from "@/lib/esim/numbers/install";

/**
 * The shopper's numbers (NUM-06/07): the list in My eSIMs and one number's
 * page. Opening the page asks TopConnect for the card (`card_stat`) — at most
 * once a minute per number — and keeps the answer, so a slow or failing
 * gateway shows the last known state instead of an error. Install details
 * (LPA, PIN/PUK) are read only for the number's owner. The packages come from
 * the detailed package list, which names each packet, so one can be cancelled
 * exactly (NUM-09).
 */

const REFRESH_EVERY_MS = 60_000;

export interface CustomerNumberCard {
  checkedAt: Date | null;
  balanceMinor: number | null;
  currency: string | null;
  blocked: boolean | null;
  lastUsedAt: Date | null;
  packages: NumberCardPackage[];
}

export interface CustomerNumberSummary {
  id: string;
  msisdn: string;
  dialCode: string;
  nationalNumber: string;
  country: string | null;
  /** The shopper's own name for it. */
  remark: string | null;
  soldAt: Date | null;
  validUntil: Date | null;
  card: CustomerNumberCard | null;
}

export interface CustomerNumber extends CustomerNumberSummary {
  iccid: string;
  orderNumber: string | null;
  install: { lpa: string; smdpAddress: string | null; matchingId: string | null; pin1: string | null; puk1: string | null; pin2: string | null; puk2: string | null };
  /** Recharges and packages paid for and still being put on the number ("€10 credit", a package's name). */
  pending: string[];
  /** The last refresh failed: what is shown is from `card.checkedAt`. */
  refreshFailed: boolean;
}

type NumberRow = Pick<IEsimNumber, "msisdn" | "dialCode" | "nationalNumber" | "country" | "soldAt" | "card"> & { remark?: string | null } & { _id: mongoose.Types.ObjectId };

function cardOf(row: NumberRow): CustomerNumberCard | null {
  if (!row.card) return null;
  return {
    checkedAt: row.card.checkedAt ?? null,
    balanceMinor: row.card.balanceMinor ?? null,
    currency: row.card.currency ?? null,
    blocked: row.card.blocked ?? null,
    lastUsedAt: row.card.lastUsedAt ?? null,
    packages: row.card.packages ?? [],
  };
}

function summaryOf(row: NumberRow): CustomerNumberSummary {
  return {
    id: String(row._id),
    msisdn: row.msisdn,
    dialCode: row.dialCode,
    nationalNumber: row.nationalNumber,
    country: row.country,
    remark: row.remark ?? null,
    soldAt: row.soldAt ?? null,
    validUntil: numberValidUntil({ lastUsedAt: row.card?.lastUsedAt, soldAt: row.soldAt }),
    card: cardOf(row),
  };
}

const owned = (userId: string) => ({ customer: new mongoose.Types.ObjectId(userId), status: "sold" as const });

export async function listCustomerNumbers(userId: string): Promise<CustomerNumberSummary[]> {
  if (!mongoose.isValidObjectId(userId)) return [];
  const rows = await EsimNumber.find(owned(userId)).sort({ soldAt: -1 }).lean<NumberRow[]>();
  return rows.map(summaryOf);
}

const date = (value: string | null) => (value ? new Date(value) : null);

/**
 * Asks TopConnect for the card and keeps the answer. Skipped when the last
 * answer is under a minute old; the refresh button (`force`) may ask every
 * 10 seconds. True when the card's state is fresh.
 */
export async function refreshNumberCard(numberId: string, options: { force?: boolean } = {}): Promise<boolean> {
  const row = await EsimNumber.findById(numberId).select({ msisdn: 1, card: 1 }).lean();
  if (!row) return false;
  const age = row.card?.checkedAt ? Date.now() - new Date(row.card.checkedAt).getTime() : Infinity;
  if (age < (options.force ? 10_000 : REFRESH_EVERY_MS)) return true;
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") return false;
  try {
    const client = topConnectClient(credentialsOf(provider));
    const context = { provider: provider._id as mongoose.Types.ObjectId, providerCode: "topconnect", request: { msisdn: row.msisdn } };
    const { card, packages: stated } = await withProviderLog(
      { ...context, operation: "numbers.card" },
      () => client.cardStatus({ msisdn: row.msisdn }),
      (result) => ({ blocked: result.card.blocked, packages: result.packages.length }),
    );
    // The detailed list carries packet codes (for cancelling); card_stat's is the fallback.
    const packages = await withProviderLog({ ...context, operation: "numbers.packages" }, () => client.activePackages(row.msisdn), (result) => ({ packages: result.length }))
      .catch(() => stated);
    await EsimNumber.updateOne(
      { _id: row._id },
      {
        $set: {
          card: {
            checkedAt: new Date(),
            balanceMinor: card.balanceMinor,
            currency: card.currency,
            blocked: card.blocked,
            lastUsedAt: date(card.lastUsedAt),
            packages: packages
              .filter((entry) => entry.kind === "gprs")
              .map((entry) => ({
                kind: entry.kind,
                packetId: entry.packetId,
                name: entry.name,
                activatedAt: date(entry.activatedAt),
                expiresAt: date(entry.expiresAt),
                totalBytes: entry.totalBytes,
                leftBytes: entry.leftBytes,
                status: entry.status,
              })),
          },
        },
      },
    );
    return true;
  } catch (error) {
    console.error("[esim] number card refresh failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

/** The shopper's own name for one of their numbers (USR-06); empty clears it. False when it is not theirs. */
export async function updateNumberRemark(userId: string, numberId: string, remark: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId)) return false;
  const result = await EsimNumber.updateOne({ _id: numberId, ...owned(userId) }, { $set: { remark: remark.trim().slice(0, 100) || null } });
  return result.matchedCount > 0;
}

/** One number of the shopper's, refreshed from TopConnect first (NUM-06); null when it is not theirs. */
export async function getCustomerNumber(userId: string, numberId: string): Promise<CustomerNumber | null> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId)) return null;
  if (!(await EsimNumber.exists({ _id: numberId, ...owned(userId) }))) return null;
  const refreshed = await refreshNumberCard(numberId);
  const row = await EsimNumber.findOne({ _id: numberId, ...owned(userId) })
    .select("+install")
    .lean<(NumberRow & Pick<IEsimNumber, "iccid" | "install" | "order">) | null>();
  if (!row) return null;
  const [job, ops, transfers] = await Promise.all([
    row.order ? EsimNumberOrder.findOne({ order: row.order, number: row._id }).select({ orderNumber: 1 }).lean() : null,
    EsimNumberOp.find({ number: row._id, state: { $in: ["queued", "processing"] } }).sort({ createdAt: 1 }).select({ kind: 1, amountMinor: 1, currency: 1, packet: 1 }).lean(),
    EsimNumberTransfer.find({ $or: [{ "from.number": row._id }, { "to.number": row._id }], state: { $in: ["queued", "processing"] } }).select({ from: 1, to: 1, amountMinor: 1, currency: 1 }).lean(),
  ]);
  const lpa = row.install?.lpa ?? "";
  return {
    ...summaryOf(row),
    iccid: row.iccid,
    orderNumber: job?.orderNumber ?? null,
    install: {
      lpa,
      ...parseLpa(lpa),
      pin1: row.install?.pin1 ?? null,
      puk1: row.install?.puk1 ?? null,
      pin2: row.install?.pin2 ?? null,
      puk2: row.install?.puk2 ?? null,
    },
    pending: [
      ...ops.map((op) => (op.kind === "packet" ? op.packet?.name ?? "Data package" : `${formatAmount(op.amountMinor, op.currency)} credit`)),
      ...transfers.map((move) => `${formatAmount(move.amountMinor, move.currency)} +${move.from.msisdn} → +${move.to.msisdn}`),
    ],
    refreshFailed: !refreshed,
  };
}

/** The refresh button (NUM-06): the shopper's own number only; null when it is not theirs. */
export async function refreshCustomerNumber(userId: string, numberId: string): Promise<boolean | null> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId)) return null;
  if (!(await EsimNumber.exists({ _id: numberId, ...owned(userId) }))) return null;
  return refreshNumberCard(numberId, { force: true });
}

/**
 * Cancels one data package on the shopper's number (NUM-09): only a package
 * the last read listed with its packet code, so the cancel is exact; unused
 * data is not refunded. The card is read again afterwards.
 */
export async function cancelCustomerPacket(userId: string, numberId: string, packetId: string): Promise<{ cancelled: boolean; message?: string } | null> {
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(numberId) || !/^\d{1,9}$/.test(packetId)) return null;
  const row = await EsimNumber.findOne({ _id: numberId, ...owned(userId) }).select({ msisdn: 1, card: 1 }).lean();
  if (!row) return null;
  if (!row.card?.packages?.some((entry) => entry.packetId === packetId)) {
    return { cancelled: false, message: "This package is not on the number any more; refresh and try again" };
  }
  const provider = await findProvider("topconnect");
  if (!provider || provider.status !== "active") return { cancelled: false, message: "Cancelling is not available right now" };
  try {
    const client = topConnectClient(credentialsOf(provider));
    await withProviderLog(
      { provider: provider._id as mongoose.Types.ObjectId, providerCode: "topconnect", operation: "numbers.cancel-packet", request: { msisdn: row.msisdn, packetId } },
      () => client.cancelDataPackage(row.msisdn, packetId),
    );
  } catch (error) {
    return { cancelled: false, message: error instanceof Error ? error.message : "TopConnect refused" };
  }
  await EsimNumber.updateOne({ _id: row._id }, { $set: { "card.checkedAt": new Date(0) } });
  await refreshNumberCard(numberId, { force: true });
  return { cancelled: true };
}

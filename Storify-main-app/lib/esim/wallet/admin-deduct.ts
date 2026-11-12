import "server-only";

import { mongoose } from "@/lib/db";
import { StoreCreditAccount, StoreCreditTransaction, type IStoreCreditTransaction } from "@/models/store-credit.model";
import { ValidationError } from "@/lib/api/errors";
import { audit, type AuditContext } from "@/lib/audit";
import { financeSession, financeTransaction } from "@/lib/finance/transaction";
import { LEDGER_ACCOUNT, LEDGER_BOOK } from "@/lib/finance/accounts";
import { postLedgerEntries, postingKey } from "@/lib/finance/ledger";
import { currencyMinorUnitExponent } from "@/lib/intl/money";
import { deductionProblem, planDeduction, toMajor, toMinor } from "@/lib/esim/wallet/deduct-policy";

/**
 * An admin takes money off a shopper's balance (Admin → Customers → Store
 * credit → Deduct). Storify can only give credit by hand; this is the other
 * way.
 *
 * The deduction is one `redeem` row, `status: "spent"`, source
 * `admin_deduction` (patch P62), taking from the lots that expire first, as
 * a checkout does. In one transaction: each lot moves by a conditional `$inc`
 * (never below nothing, and a checkout spending the same lot meanwhile makes
 * the transaction retry on fresh lots), the row is written, the audit row
 * too. Idempotent on `idempotencyKey`: a double click deducts once.
 *
 * Booked as the reverse of giving credit by hand (`storeCreditPostings`,
 * goodwill): debit store credit payable, credit promotions.
 */

export interface DeductStoreCreditInput {
  customerId: string;
  currency: string;
  amountMinor: number;
  reason: string;
  adminId: string;
  idempotencyKey: string;
  audit: AuditContext;
  /** Shown beside the ledger entry and in the audit row. */
  customerLabel?: string | null;
}

export interface DeductStoreCreditResult {
  row: IStoreCreditTransaction;
  /** False when the key had already deducted: nothing moved this time. */
  created: boolean;
}

type LiveLot = { _id: mongoose.Types.ObjectId; remaining: number; expiresAt?: Date | null; createdAt: Date };

const liveLot = (now: Date) => ({
  type: "issue",
  remaining: { $gt: 0 },
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
});

export async function deductStoreCredit(input: DeductStoreCreditInput): Promise<DeductStoreCreditResult> {
  if (!mongoose.isValidObjectId(input.customerId)) throw new ValidationError("Unknown customer");
  const customerId = new mongoose.Types.ObjectId(input.customerId);
  const currency = input.currency.trim().toUpperCase();
  const exponent = currencyMinorUnitExponent(currency);
  const reason = input.reason.trim();
  if (!reason) throw new ValidationError("Say why the balance is deducted");

  const earlier = await StoreCreditTransaction.findOne({ idempotencyKey: input.idempotencyKey }).lean<IStoreCreditTransaction | null>();
  if (earlier) return { row: earlier, created: false };

  const row = await financeTransaction("esim:store-credit-deduct", async () => {
    const session = financeSession();
    const now = new Date();
    // Inside the transaction: a retry after a write conflict reads the key afresh.
    const again = await StoreCreditTransaction.findOne({ idempotencyKey: input.idempotencyKey }).session(session ?? null).lean<IStoreCreditTransaction | null>();
    if (again) return null;
    const lots = await StoreCreditTransaction.find({ customerId, currency, ...liveLot(now) })
      .select("_id remaining expiresAt createdAt")
      .session(session ?? null)
      .lean<LiveLot[]>();
    const balanceMinor = lots.reduce((sum, lot) => sum + toMinor(lot.remaining, exponent), 0);
    const problem = deductionProblem(input.amountMinor, balanceMinor);
    if (problem) throw new ValidationError(problem);
    const plan = planDeduction(
      lots.map((lot) => ({ id: lot._id, remainingMinor: toMinor(lot.remaining, exponent), expiresAt: lot.expiresAt, createdAt: lot.createdAt })),
      input.amountMinor,
    );
    if (plan.short > 0) throw new ValidationError("The amount is more than the customer's balance");

    for (const take of plan.takes) {
      const amount = toMajor(take.amountMinor, exponent);
      const moved = await StoreCreditTransaction.updateOne(
        { _id: take.id, ...liveLot(now), remaining: { $gte: amount } },
        { $inc: { remaining: -amount } },
        { session },
      );
      // Spent elsewhere since it was read: nothing of this transaction stands.
      if (moved.modifiedCount !== 1) throw new ValidationError("The balance changed meanwhile; try again");
    }
    const account = await StoreCreditAccount.findOneAndUpdate(
      { customerId, currency },
      { $setOnInsert: { balance: 0 } },
      { upsert: true, returnDocument: "after", session },
    ).lean<{ _id: mongoose.Types.ObjectId } | null>();
    if (!account) throw new Error("Store credit account could not be opened");
    const [created] = await StoreCreditTransaction.create(
      [
        {
          accountId: account._id,
          customerId,
          currency,
          type: "redeem",
          status: "spent",
          source: "admin_deduction",
          amount: toMajor(input.amountMinor, exponent),
          lots: plan.takes.map((take) => ({ lotId: take.id, amount: toMajor(take.amountMinor, exponent) })),
          note: reason.slice(0, 500),
          createdBy: input.adminId,
          idempotencyKey: input.idempotencyKey,
        },
      ],
      { session },
    );
    const balanceAfterMinor = balanceMinor - input.amountMinor;
    await StoreCreditAccount.updateOne({ _id: account._id }, { $set: { balance: toMajor(balanceAfterMinor, exponent) } }, { session });
    await audit(input.audit, {
      action: "UPDATE",
      resource: "storeCredit",
      resourceId: String(created!._id),
      resourceName: input.customerLabel ?? String(customerId),
      changes: {
        before: { balanceMinor },
        after: {
          customerId: String(customerId),
          deductedMinor: input.amountMinor,
          balanceMinor: balanceAfterMinor,
          currency,
          reason,
          lots: plan.takes.map((take) => ({ lotId: String(take.id), amountMinor: take.amountMinor })),
        },
        summary: `Deducted ${(input.amountMinor / 10 ** exponent).toFixed(exponent)} ${currency} from the store credit of ${input.customerLabel || `customer ${customerId}`} — ${reason.slice(0, 200)}`,
      },
    });
    return created!.toObject() as IStoreCreditTransaction;
  }).catch(async (error) => {
    // The same key sent twice at once: the other request deducted.
    if ((error as { code?: number })?.code === 11000) return null;
    throw error;
  });

  if (!row) {
    const kept = await StoreCreditTransaction.findOne({ idempotencyKey: input.idempotencyKey }).lean<IStoreCreditTransaction | null>();
    if (!kept) throw new Error("The deduction could not be saved");
    return { row: kept, created: false };
  }

  // Off the books once committed: the reverse of goodwill. The key makes a replay harmless.
  await postLedgerEntries(
    [
      {
        date: new Date(row.createdAt ?? Date.now()),
        book: LEDGER_BOOK.OWN,
        debit: LEDGER_ACCOUNT.STORE_CREDIT_PAYABLE,
        credit: LEDGER_ACCOUNT.PROMOTIONS,
        amount: row.amount,
        currency,
        source: { kind: "store_credit", id: row._id, ref: input.customerLabel ?? null },
        note: `Store credit deducted by an admin: ${reason.slice(0, 200)}`,
        key: postingKey("store_credit", row._id, "admin_deduction"),
      },
    ],
    { strict: true },
  ).catch((error) => console.error(`[esim] ledger entry for store credit deduction ${String(row._id)} failed:`, error));

  return { row, created: true };
}

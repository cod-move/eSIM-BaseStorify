import "server-only";

import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { EsimReferral } from "@/models/esim-referral.model";

/**
 * The admin customer list's "Invited by" (patch P84): who each account on
 * the page signed up through (REF-01). Two small reads for the page's rows
 * only, after Storify's list has been cut to its page.
 */

export interface CustomerReferrer {
  /** The inviter's user id; the customer page opens a user id as its profile (P63). */
  userId: string;
  name: string | null;
  email: string | null;
}

type Row = { user?: { _id?: unknown } | null };

export async function withCustomerReferrers<T>(rows: T[]): Promise<T[]> {
  const ids = rows
    .map((row) => (row as Row).user?._id)
    .filter((id): id is mongoose.Types.ObjectId | string => Boolean(id) && mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(String(id)));
  if (!ids.length) return rows;
  try {
    const referrals = await EsimReferral.find({ referee: { $in: ids } })
      .select({ referrer: 1, referee: 1 })
      .lean<Array<{ referrer: mongoose.Types.ObjectId; referee: mongoose.Types.ObjectId }>>();
    if (!referrals.length) return rows;
    const users = await User.find({ _id: { $in: referrals.map((row) => row.referrer) } })
      .select({ name: 1, email: 1 })
      .lean<Array<{ _id: mongoose.Types.ObjectId; name?: string; email?: string }>>();
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const referrerOf = new Map(
      referrals.map((row) => {
        const user = userById.get(String(row.referrer));
        return [String(row.referee), { userId: String(row.referrer), name: user?.name || null, email: user?.email || null } satisfies CustomerReferrer];
      }),
    );
    return rows.map((row) => {
      const referrer = referrerOf.get(String((row as Row).user?._id));
      return referrer ? { ...row, esimReferrer: referrer } : row;
    });
  } catch (error) {
    // The list still opens without the column's names.
    console.error("[esim] customer referrers could not be read:", error);
    return rows;
  }
}

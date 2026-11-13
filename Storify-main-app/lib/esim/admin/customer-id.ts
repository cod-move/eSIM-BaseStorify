import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { CustomerProfile } from "@/models";

/**
 * The customer page's id, as the page and its API want it: a CustomerProfile
 * id (patch P63). Storify's own "new customer" notification links to the
 * account's user id instead (lib/auth/user-created.ts,
 * lib/customers/customer-upsert.ts), so opening one answered "Failed to load
 * customer". A user id that has a customer profile becomes that profile's id;
 * anything else is returned as it was.
 */
export async function customerPageId(id: string): Promise<string> {
  if (!mongoose.isValidObjectId(id)) return id;
  try {
    await connectDB();
    if (await CustomerProfile.exists({ _id: id })) return id;
    const profile = await CustomerProfile.findOne({ userId: new mongoose.Types.ObjectId(id) })
      .select("_id")
      .lean<{ _id: mongoose.Types.ObjectId } | null>();
    return profile ? String(profile._id) : id;
  } catch {
    return id;
  }
}

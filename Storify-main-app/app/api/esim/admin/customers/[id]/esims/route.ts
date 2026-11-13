import { connectDB, mongoose } from "@/lib/db";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { listAdminEsims } from "@/lib/esim/admin/esims";
import { ESIM_READ } from "@/lib/esim/admin/route";
import { CustomerProfile, User } from "@/models";
import { EsimNumber } from "@/models/esim-number.model";

/**
 * One customer's eSIMs, for the eSIM tab of the admin customer page (patch
 * P59). `id` is the CustomerProfile id the page is opened with: the account's
 * eSIMs, and the guest ones bought with its email; and the account's number
 * cards (`numbers`, not paged).
 */
export const GET = withApi<{ id: string }>(
  ESIM_READ,
  async ({ request, params }) => {
    await connectDB();
    if (!mongoose.isValidObjectId(params.id))
      throw new NotFoundError("Customer not found");
    const profile = await CustomerProfile.findById(params.id)
      .select("userId email")
      .lean<{
        userId?: mongoose.Types.ObjectId | null;
        email?: string | null;
      } | null>();
    if (!profile) throw new NotFoundError("Customer not found");
    // An account's profile keeps no email (it is on the account): read it
    // there, so eSIMs bought as a guest with that email before signing up
    // are listed too, as the shopper's own My eSIMs page lists them.
    const accountEmail = profile.userId
      ? (await User.findById(profile.userId).select("email").lean<{ email?: string } | null>())?.email ?? null
      : null;
    const url = new URL(request.url);
    const [list, numbers] = await Promise.all([
      listAdminEsims(
        {
          owner: {
            userId: profile.userId ? String(profile.userId) : null,
            email: profile.email ?? accountEmail,
          },
        },
        {
          page: Number(url.searchParams.get("page")) || 1,
          pageSize: Number(url.searchParams.get("pageSize")) || 10,
        },
      ),
      // Number cards are bought signed in only, so the account owns them.
      profile.userId
        ? EsimNumber.find({ customer: profile.userId })
            .sort({ soldAt: -1 })
            .limit(100)
            .select({
              msisdn: 1,
              iccid: 1,
              providerCode: 1,
              status: 1,
              soldAt: 1,
              card: 1,
            })
            .lean()
        : [],
    ]);
    return successResponse({
      ...list,
      numbers: numbers.map((number) => ({
        id: String(number._id),
        msisdn: number.msisdn,
        iccid: number.iccid,
        providerCode: number.providerCode,
        status: number.status,
        soldAt: number.soldAt ?? null,
        balanceMinor: number.card?.balanceMinor ?? null,
        currency: number.card?.currency ?? null,
        blocked: number.card?.blocked ?? null,
        lastUsedAt: number.card?.lastUsedAt ?? null,
      })),
    });
  },
);

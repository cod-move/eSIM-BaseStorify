import { connectDB, mongoose } from "@/lib/db";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { listSignIns } from "@/lib/esim/account/sign-ins";
import { ESIM_READ } from "@/lib/esim/admin/route";
import { CustomerProfile } from "@/models";

/**
 * One customer's sign-ins (patch P61), for the admin customer page. `id` is
 * the CustomerProfile id; a guest row has no account, so no sign-ins.
 */
export const GET = withApi<{ id: string }>(
  ESIM_READ,
  async ({ request, params }) => {
    await connectDB();
    if (!mongoose.isValidObjectId(params.id))
      throw new NotFoundError("Customer not found");
    const profile = await CustomerProfile.findById(params.id)
      .select("userId")
      .lean<{ userId?: mongoose.Types.ObjectId | null } | null>();
    if (!profile) throw new NotFoundError("Customer not found");
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page")) || 1;
    if (!profile.userId) {
      return successResponse({
        rows: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
      });
    }
    return successResponse(
      await listSignIns(String(profile.userId), { page, pageSize: 20 }),
    );
  },
);

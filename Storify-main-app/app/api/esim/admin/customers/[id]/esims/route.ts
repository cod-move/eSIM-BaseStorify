import { connectDB, mongoose } from "@/lib/db";
import { successResponse } from "@/lib/api/response";
import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { listAdminEsims } from "@/lib/esim/admin/esims";
import { ESIM_READ } from "@/lib/esim/admin/route";
import { CustomerProfile } from "@/models";

/**
 * One customer's eSIMs, for the eSIM tab of the admin customer page (patch
 * P59). `id` is the CustomerProfile id the page is opened with: the account's
 * eSIMs, and the guest ones bought with its email.
 */
export const GET = withApi<{ id: string }>(ESIM_READ, async ({ request, params }) => {
  await connectDB();
  if (!mongoose.isValidObjectId(params.id)) throw new NotFoundError("Customer not found");
  const profile = await CustomerProfile.findById(params.id)
    .select("userId email")
    .lean<{ userId?: mongoose.Types.ObjectId | null; email?: string | null } | null>();
  if (!profile) throw new NotFoundError("Customer not found");
  const url = new URL(request.url);
  const list = await listAdminEsims(
    { owner: { userId: profile.userId ? String(profile.userId) : null, email: profile.email ?? null } },
    { page: Number(url.searchParams.get("page")) || 1, pageSize: Number(url.searchParams.get("pageSize")) || 10 },
  );
  return successResponse(list);
});

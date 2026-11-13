import "server-only";

import { connectDB, mongoose } from "@/lib/db";
import { CustomerProfile, EmailDelivery, User } from "@/models";
import { getSettings } from "@/models/settings.model";
import { EsimAdminEmail, type IEsimAdminEmail } from "@/models/esim-admin-email.model";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { queueEmailWithEvidence } from "@/lib/email/email";
import { customerEmailHtml, customerEmailText } from "@/lib/esim/admin/customer-email-body";

/**
 * Emails an admin writes to one customer by hand (Admin → Customers → a
 * customer → Send email), and the list of them on that page.
 *
 * The address is always read here from the customer's account (or, for a
 * guest, the profile), never taken from the browser. Sending is idempotent on
 * the request id the dialog makes each time it opens: the outbox is keyed on
 * it (`dedupeKey`) and so is the record kept here (`requestKey`), so a double
 * click or a retry after a lost answer sends one email.
 */

export interface CustomerEmailRow {
  id: string;
  to: string;
  subject: string;
  message: string;
  /** queued / sending / retrying / sent / failed / cancelled / unconfigured. */
  status: string;
  error: string | null;
  sentByEmail: string | null;
  createdAt: string;
  sentAt: string | null;
}

/** Who a profile's email goes to: the account's address, or the guest's. */
async function recipientOf(profileId: string) {
  if (!mongoose.isValidObjectId(profileId)) throw new NotFoundError("Customer not found");
  const profile = await CustomerProfile.findById(profileId)
    .select("userId email")
    .lean<{ _id: mongoose.Types.ObjectId; userId?: mongoose.Types.ObjectId | null; email?: string | null } | null>();
  if (!profile) throw new NotFoundError("Customer not found");
  const user = profile.userId
    ? await User.findById(profile.userId).select("email").lean<{ email?: string } | null>()
    : null;
  const to = (user?.email || profile.email || "").trim();
  if (!to) throw new ValidationError("This customer has no email address");
  return { profile: profile._id, user: profile.userId ?? null, to };
}

function rowOf(row: IEsimAdminEmail, live?: { status?: string; sentAt?: Date; lastError?: string } | null): CustomerEmailRow {
  return {
    id: String(row._id),
    to: row.to,
    subject: row.subject,
    message: row.message,
    status: live?.status ?? row.status,
    error: live?.lastError ?? row.error,
    sentByEmail: row.sentByEmail,
    createdAt: row.createdAt.toISOString(),
    sentAt: live?.sentAt ? live.sentAt.toISOString() : null,
  };
}

export async function sendCustomerEmail(input: {
  profileId: string;
  subject: string;
  message: string;
  requestId: string;
  admin: { id?: string; email?: string };
}): Promise<{ row: CustomerEmailRow; created: boolean }> {
  await connectDB();
  const recipient = await recipientOf(input.profileId);
  const requestKey = `${String(recipient.profile)}:${input.requestId}`;

  const earlier = await EsimAdminEmail.findOne({ requestKey }).lean<IEsimAdminEmail | null>();
  if (earlier) return { row: rowOf(earlier), created: false };

  const settings = await getSettings();
  const storeName = settings.general?.storeName || process.env.NEXT_PUBLIC_APP_NAME || "Our store";
  const outcome = await queueEmailWithEvidence({
    to: recipient.to,
    subject: input.subject,
    html: customerEmailHtml({ message: input.message, storeName }),
    text: customerEmailText({ message: input.message, storeName }),
    replyTo: settings.email?.replyTo || undefined,
    category: "transactional",
    dedupeKey: `esim-admin-mail:${requestKey}`,
    settings,
  });

  try {
    const created = await EsimAdminEmail.create({
      profile: recipient.profile,
      user: recipient.user,
      requestKey,
      to: recipient.to,
      subject: input.subject,
      message: input.message,
      job: outcome.jobId && mongoose.isValidObjectId(outcome.jobId) ? outcome.jobId : null,
      status: outcome.status,
      error: outcome.error ?? (outcome.status === "unconfigured" ? "Email delivery is not set up" : null),
      sentBy: input.admin.id && mongoose.isValidObjectId(input.admin.id) ? input.admin.id : null,
      sentByEmail: input.admin.email ?? null,
    });
    return { row: rowOf(created.toObject(), outcome.sentAt ? { status: outcome.status, sentAt: outcome.sentAt } : null), created: true };
  } catch (error) {
    // The same request, sent twice at once: the other one kept its record.
    if ((error as { code?: number } | null)?.code !== 11000) throw error;
    const raced = await EsimAdminEmail.findOne({ requestKey }).lean<IEsimAdminEmail | null>();
    if (!raced) throw error;
    return { row: rowOf(raced), created: false };
  }
}

/** The emails written to this customer by hand, newest first, with their delivery status. */
export async function listCustomerEmails(profileId: string, limit = 50): Promise<CustomerEmailRow[]> {
  await connectDB();
  if (!mongoose.isValidObjectId(profileId)) throw new NotFoundError("Customer not found");
  const rows = await EsimAdminEmail.find({ profile: profileId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<IEsimAdminEmail[]>();
  const jobs = rows.map((row) => row.job).filter((job): job is mongoose.Types.ObjectId => Boolean(job));
  const live = jobs.length
    ? await EmailDelivery.find({ _id: { $in: jobs } })
        .select("status sentAt lastError")
        .lean<Array<{ _id: mongoose.Types.ObjectId; status?: string; sentAt?: Date; lastError?: string }>>()
    : [];
  const byId = new Map(live.map((job) => [String(job._id), job]));
  return rows.map((row) => rowOf(row, row.job ? byId.get(String(row.job)) : null));
}

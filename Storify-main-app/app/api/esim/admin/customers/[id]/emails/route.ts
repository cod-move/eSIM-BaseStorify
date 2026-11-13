import * as z from "zod";
import { successResponse } from "@/lib/api/response";
import { validateBody } from "@/lib/api/validate";
import { withApi } from "@/lib/api/handler";
import { auditEsim, ESIM_READ, ESIM_WRITE } from "@/lib/esim/admin/route";
import { listCustomerEmails, sendCustomerEmail } from "@/lib/esim/admin/customer-email";
import {
  CUSTOMER_EMAIL_MESSAGE_MAX,
  CUSTOMER_EMAIL_SUBJECT_MAX,
} from "@/lib/esim/admin/customer-email-body";

const SendSchema = z.object({
  subject: z.string().trim().min(1, "Write a subject").max(CUSTOMER_EMAIL_SUBJECT_MAX),
  message: z.string().trim().min(1, "Write a message").max(CUSTOMER_EMAIL_MESSAGE_MAX),
  /** One per opening of the dialog, so a double click sends once. */
  requestId: z.string().trim().min(8).max(100),
});

/**
 * Emails written to one customer by hand, from the admin customer page
 * (patch P69). `id` is the CustomerProfile id. GET lists them; POST sends one
 * to the customer's own address and records it in the audit log.
 */
export const GET = withApi<{ id: string }>(ESIM_READ, async ({ params }) =>
  successResponse({ emails: await listCustomerEmails(params.id) }),
);

export const POST = withApi<{ id: string }>(
  { ...ESIM_WRITE, rateLimit: { action: "esim:admin:customer-email", preset: "moderate" as const } },
  async ({ request, params, session }) => {
    const body = await validateBody(request, SendSchema);
    const { row, created } = await sendCustomerEmail({
      profileId: params.id,
      subject: body.subject,
      message: body.message,
      requestId: body.requestId,
      admin: { id: session?.user?.id, email: session?.user?.email },
    });
    if (created) {
      await auditEsim(request, session, {
        resourceId: `esim:customer-email:${params.id}`,
        resourceName: row.to,
        summary: `Emailed the customer: ${row.subject} (${row.status})`,
        after: { to: row.to, subject: row.subject, status: row.status },
      });
    }
    return successResponse({ email: row, created });
  },
);

import { withApi } from "@/lib/api/handler";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import { connectDB } from "@/lib/db";
import { numberStatement } from "@/lib/esim/numbers/statement";
import { numberStatementPdf } from "@/lib/esim/numbers/statement-pdf";

/** One of the shopper's numbers' phone bill for whole past months (`?from=YYYY-MM&to=YYYY-MM`), as a PDF. */
export const GET = withApi<{ id: string }>(
  { auth: "user", rateLimit: { action: "esim:number-statement", preset: "strict" } },
  async ({ request, params, session }) => {
    const query = new URL(request.url).searchParams;
    await connectDB();
    const result = await numberStatement(session.user.id, params.id, { from: query.get("from") ?? "", to: query.get("to") ?? "" });
    if (result === null) throw new NotFoundError("Number not found");
    if (!result.ok) throw new ValidationError(result.message);
    const pdf = await numberStatementPdf(result.data);
    const name = `phone-bill-${result.data.msisdn}-${result.data.months[0].month}${result.data.months.length > 1 ? `-to-${result.data.months[result.data.months.length - 1].month}` : ""}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  },
);

import {
  EsimNumberActionResult,
  EsimNumberOwnerRequest,
  EsimNumberQrRequest,
  EsimNumberReleaseRequest,
  EsimNumberStatement,
  EsimNumberStatementQuery,
  EsimNumberVoucherRequest,
} from "@/contracts/mobile/shop/v1/esim";
import { defineRoute } from "@/lib/api-core/registry";
import { connectDB } from "@/lib/db";
import { releaseNumber, requestNewQr, transferNumberOwnership } from "@/lib/esim/numbers/requests";
import { redeemNumberVoucher } from "@/lib/esim/numbers/services";
import { numberStatement } from "@/lib/esim/numbers/statement";
import { numberStatementPdf } from "@/lib/esim/numbers/statement-pdf";
import { NUMBER_REASONS, numberNotFound, numberRefused } from "./number-refusals";

/**
 * A number's "Manage" actions in the shopper app, the website's own
 * (lib/esim/numbers/requests.ts, services.ts, statement.ts): a new QR code
 * (its fee off the number's credit), moving the number to another account,
 * giving it up, a recharge voucher and the phone bill. The first three are
 * carried out once per `key`, whatever the app sends again.
 */

/** POST /me/esim-numbers/{id}/qr: asks for a new QR code; the fee comes off the number's credit. */
export const myNumberQrRoute = defineRoute({
  id: "me.esim-numbers.qr",
  method: "POST",
  path: "/me/esim-numbers/{id}/qr",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberQrRequest,
  output: EsimNumberActionResult,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:qr", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await requestNewQr(session.user.id, params.id, input.key);
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { state: result.state, ...(result.message ? { message: result.message } : {}) };
  },
});

/** POST /me/esim-numbers/{id}/owner: the number moves to the account with this email. Permanent. */
export const myNumberOwnerRoute = defineRoute({
  id: "me.esim-numbers.owner",
  method: "POST",
  path: "/me/esim-numbers/{id}/owner",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberOwnerRequest,
  output: EsimNumberActionResult,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:owner", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await transferNumberOwnership(session.user.id, params.id, input);
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { state: result.state, ...(result.message ? { message: result.message } : {}) };
  },
});

/** POST /me/esim-numbers/{id}/release: gives the number up (`confirm` is the number typed). Permanent. */
export const releaseMyNumberRoute = defineRoute({
  id: "me.esim-numbers.release",
  method: "POST",
  path: "/me/esim-numbers/{id}/release",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberReleaseRequest,
  output: EsimNumberActionResult,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:release", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await releaseNumber(session.user.id, params.id, input);
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { state: result.state, ...(result.message ? { message: result.message } : {}) };
  },
});

/** POST /me/esim-numbers/{id}/voucher: a TopConnect recharge voucher's value onto the number. */
export const myNumberVoucherRoute = defineRoute({
  id: "me.esim-numbers.voucher",
  method: "POST",
  path: "/me/esim-numbers/{id}/voucher",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberVoucherRequest,
  output: EsimNumberActionResult,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:voucher", preset: "strict" },
  demo: "block-mutations",
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await redeemNumberVoucher(session.user.id, params.id, input.pin.replace(/[\s-]/g, ""));
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    return { state: "completed" };
  },
});

/** GET /me/esim-numbers/{id}/statement?from=YYYY-MM&to=YYYY-MM: the phone bill for whole past months, a PDF. */
export const myNumberStatementRoute = defineRoute({
  id: "me.esim-numbers.statement",
  method: "GET",
  path: "/me/esim-numbers/{id}/statement",
  auth: "user",
  cache: { kind: "private" },
  input: EsimNumberStatementQuery,
  output: EsimNumberStatement,
  reasons: NUMBER_REASONS,
  rateLimit: { bucket: "esim:number:statement", preset: "strict" },
  handler: async ({ session, params, input }) => {
    await connectDB();
    const result = await numberStatement(session.user.id, params.id, { from: input.from, to: input.to });
    if (result === null) throw numberNotFound();
    if (!result.ok) throw numberRefused(result.message);
    const pdf = await numberStatementPdf(result.data);
    const months = result.data.months;
    const fileName = `phone-bill-${result.data.msisdn}-${months[0].month}${months.length > 1 ? `-to-${months[months.length - 1].month}` : ""}.pdf`;
    return { fileName, pdfBase64: Buffer.from(pdf).toString("base64") };
  },
});

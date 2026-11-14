import "server-only";

import QRCode from "qrcode";
import { mongoose } from "@/lib/db";
import { User } from "@/models";
import { getSettings } from "@/models/settings.model";
import { EsimNumber } from "@/models/esim-number.model";
import { EsimNumberRequest } from "@/models/esim-number-request.model";
import { NotificationType } from "@/models/notification.model";
import { sendEmail } from "@/lib/email/email";
import { escapeHtml } from "@/lib/email/escape-html";
import { createNotification } from "@/lib/notifications/notifications";
import { installLinks } from "@/lib/esim/fulfillment/install-links";
import { parseLpa } from "@/lib/esim/numbers/install";
import { formatAmount } from "@/lib/esim/numbers/line";

/**
 * Telling the shopper a new-QR-code request was answered: an in-app notice
 * (pushed to the app where they allow it) and an email. Done: the new QR
 * code attached with the manual details and the new ICCID; the PIN/PUK stay
 * on the number's page. Declined: the person's note, and the fee going back
 * on the number. Once per request (the notice and the email are deduped by
 * the request). Never throws: the answer is saved already.
 */
export async function noticeQrAnswered(requestId: string): Promise<{ notice: boolean; email: boolean }> {
  try {
    const request = await EsimNumberRequest.findById(requestId).lean();
    if (!request || request.kind !== "qr") return { notice: false, email: false };
    const done = request.state === "completed";
    if (!done && request.state !== "rejected" && request.state !== "refunding") return { notice: false, email: false };
    const number = await EsimNumber.findById(request.number)
      .select("+install")
      .lean<{ _id: mongoose.Types.ObjectId; dialCode: string; nationalNumber: string; iccid: string; customer?: mongoose.Types.ObjectId | null; install?: { lpa?: string } } | null>();
    if (!number) return { notice: false, email: false };
    const title = `+${number.dialCode} ${number.nationalNumber}`;
    const link = `/account/esims/numbers/${number._id}`;
    const key = `esim-number-qr-answer:${requestId}`;
    const note = request.resolution?.note?.trim() || null;
    const fee = request.feeMinor > 0 && request.charge?.done ? formatAmount(request.feeMinor, request.currency) : null;

    const customerId = String(request.customer);
    let notice = false;
    if (mongoose.isValidObjectId(customerId)) {
      notice = Boolean(
        await createNotification({
          userId: customerId,
          type: NotificationType.SYSTEM,
          title: done ? "Your new QR code is ready" : "Your new QR code request was declined",
          message: done
            ? `${title}: open the number to install the new eSIM. The old one stops working.`
            : `${title}: ${note ?? "the request was declined"}${fee ? `. The ${fee} fee goes back on the number.` : ""}`.slice(0, 200),
          link,
          data: { esimNumber: String(number._id), key },
          dedupe: { "data.key": key },
          sendPush: true,
        }).catch((error) => {
          console.error("Number QR notice failed:", error);
          return null;
        }),
      );
    }

    const user = mongoose.isValidObjectId(customerId) ? await User.findById(customerId).select({ email: 1 }).lean<{ email?: string } | null>() : null;
    if (!user?.email) return { notice, email: false };
    const settings = await getSettings();
    const storeName = settings.general?.storeName || process.env.NEXT_PUBLIC_APP_NAME || "Our store";
    const footer = `<p style="color:#666;font-size:13px">If you need help, just reply.</p><p style="color:#666;font-size:13px">${escapeHtml(storeName)}</p>`;
    let email: boolean;
    if (done) {
      const lpa = number.install?.lpa ?? null;
      const file = `number-${number.dialCode}${number.nationalNumber}.png`;
      const links = installLinks(lpa);
      const manual = parseLpa(lpa);
      const row = (label: string, value: string | null | undefined) =>
        value ? `<tr><td style="padding:4px 12px 4px 0;color:#666">${label}</td><td style="padding:4px 0;font-family:monospace;word-break:break-all">${escapeHtml(value)}</td></tr>` : "";
      email = await sendEmail({
        to: user.email,
        subject: `Your new QR code for ${title}`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
      <h2>Your new QR code is ready</h2>
      <p>Your number <b style="font-family:monospace">${escapeHtml(title)}</b> is on a new eSIM now. Delete the old eSIM from your phone, then, while you have Wi-Fi, scan the attached QR code <b>${escapeHtml(file)}</b> or install it by hand with the details below. The old eSIM no longer works.</p>
      ${links ? `<p><a href="${escapeHtml(links.ios)}">Install on iPhone (iOS 17.4+)</a> &nbsp;·&nbsp; <a href="${escapeHtml(links.android)}">Install on Android</a></p>` : ""}
      <table style="border-collapse:collapse;font-size:14px">
        ${row("SM-DP+ address", manual.smdpAddress)}
        ${row("Activation code", manual.matchingId)}
        ${row("Full activation code", lpa)}
        ${row("ICCID", number.iccid)}
      </table>
      ${note ? `<p>${escapeHtml(note)}</p>` : ""}
      <p>The new PIN and PUK are on the number's page in your account (My eSIMs). The number's credit and packages stay as they were.</p>
      <p style="color:#666;font-size:13px">Keep this email: a QR code can usually be installed only once.</p>
      ${footer}
    </div>`,
        attachments: lpa ? [{ filename: file, content: await QRCode.toBuffer(lpa, { type: "png", width: 480, margin: 2, errorCorrectionLevel: "M" }), contentType: "image/png" }] : [],
        category: "esim-delivery",
        dedupeKey: key,
        settings,
      });
    } else {
      email = await sendEmail({
        to: user.email,
        subject: `Your new QR code request for ${title}`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#222">
      <h2>Your new QR code request was declined</h2>
      <p>We could not make a new QR code for <b style="font-family:monospace">${escapeHtml(title)}</b>.${note ? ` ${escapeHtml(note)}` : ""}</p>
      ${fee ? `<p>The ${escapeHtml(fee)} fee goes back on the number.</p>` : ""}
      <p>Your current eSIM keeps working.</p>
      ${footer}
    </div>`,
        category: "esim-delivery",
        dedupeKey: key,
        settings,
      });
    }
    return { notice, email };
  } catch (error) {
    console.error("Number QR answer notice failed:", error);
    return { notice: false, email: false };
  }
}

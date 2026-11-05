import { NextResponse, type NextRequest } from "next/server";
import { receiveNotice } from "@/lib/esim/payments/service";

/**
 * A payment gateway's notification for one eSIM payment method (PAY, patch
 * P15). The plugin checks the signature; the answer is the plain text the
 * gateway expects ("success", "SUCCESS", …). JSON or form bodies, plus query
 * parameters, as the old store's gateways sent them; the raw body and headers
 * too, for a gateway that signs them (Stripe).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ method: string }> }) {
  const { method } = await params;
  const raw = await request.text();
  const body: Record<string, unknown> = Object.fromEntries(request.nextUrl.searchParams);
  const type = request.headers.get("content-type") || "";
  try {
    if (type.includes("application/x-www-form-urlencoded")) {
      Object.assign(body, Object.fromEntries(new URLSearchParams(raw)));
    } else if (raw.trim()) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.assign(body, parsed);
    }
  } catch {
    return new NextResponse("invalid body", { status: 400 });
  }

  try {
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      headers[name.toLowerCase()] = value;
    });
    const answer = await receiveNotice(method, body, { raw, headers, now: Date.now() });
    return new NextResponse(answer.text, { status: answer.accepted ? 200 : 400, headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    console.error(`Payment notification for ${method} failed:`, error);
    return new NextResponse("error", { status: 500 });
  }
}

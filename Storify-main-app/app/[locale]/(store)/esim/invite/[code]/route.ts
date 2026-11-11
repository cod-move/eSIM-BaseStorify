import { NextResponse, type NextRequest } from "next/server";
import { appBaseUrl } from "@/lib/app-url";
import { connectDB } from "@/lib/db";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, referralCodeExists } from "@/lib/esim/referral/service";

/**
 * An invite link (REF-01): /esim/invite/<code>. A known code is kept in a
 * cookie for 30 days, so the account the visitor opens later is recorded as
 * this code's referral (patch P14); then on to the eSIM destinations.
 *
 * The redirect is relative: behind a proxy `request.url` is the address Next
 * listens on (http://localhost:3000), which a visitor's browser cannot open.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  const response = new NextResponse(null, { status: 307, headers: { Location: `/${encodeURIComponent(locale)}/esim` } });
  await connectDB();
  if (!(await referralCodeExists(code))) return response;
  response.cookies.set(REFERRAL_COOKIE, code.trim().toUpperCase(), {
    maxAge: REFERRAL_COOKIE_DAYS * 86_400,
    httpOnly: true,
    sameSite: "lax",
    secure: request.headers.get("x-forwarded-proto") === "https" || appBaseUrl().startsWith("https:") || request.nextUrl.protocol === "https:",
    path: "/",
  });
  return response;
}

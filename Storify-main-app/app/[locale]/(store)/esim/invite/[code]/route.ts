import { NextResponse, type NextRequest } from "next/server";
import { connectDB } from "@/lib/db";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS, referralCodeExists } from "@/lib/esim/referral/service";

/**
 * An invite link (REF-01): /esim/invite/<code>. A known code is kept in a
 * cookie for 30 days, so the account the visitor opens later is recorded as
 * this code's referral (patch P14); then on to the eSIM destinations.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ locale: string; code: string }> }) {
  const { code } = await params;
  const target = new URL("/esim", request.url);
  await connectDB();
  if (!(await referralCodeExists(code))) return NextResponse.redirect(target);
  const response = NextResponse.redirect(target);
  response.cookies.set(REFERRAL_COOKIE, code.trim().toUpperCase(), {
    maxAge: REFERRAL_COOKIE_DAYS * 86_400,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
  });
  return response;
}

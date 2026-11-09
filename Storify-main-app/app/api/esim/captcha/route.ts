import { NextResponse } from "next/server";
import { captchaEnabled, issueCaptcha } from "@/lib/esim/captcha/service";

/** A new picture code for the sign-in and sign-up forms (patch P46). */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!captchaEnabled()) return NextResponse.json({ enabled: false }, { headers });
  return NextResponse.json({ enabled: true, ...issueCaptcha() }, { headers });
}

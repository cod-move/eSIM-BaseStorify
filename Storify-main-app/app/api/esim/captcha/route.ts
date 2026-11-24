import { NextResponse } from "next/server";
import { captchaEnabled, issueCaptcha, signInTurnstileKey } from "@/lib/esim/captcha/service";

/** The sign-in and sign-up check (patch P46): Cloudflare Turnstile's site key when the store has one, else a new picture code. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  if (!captchaEnabled()) return NextResponse.json({ enabled: false }, { headers });
  const siteKey = await signInTurnstileKey();
  if (siteKey) return NextResponse.json({ enabled: true, turnstile: siteKey }, { headers });
  return NextResponse.json({ enabled: true, ...issueCaptcha() }, { headers });
}

import "server-only";

import { connectDB } from "@/lib/db";
import { EsimCaptchaUse } from "@/models/esim-captcha.model";
import { getSettings } from "@/models/settings.model";
import { turnstileSiteKey, verifyTurnstileToken } from "@/lib/checkout/turnstile";
import { CAPTCHA_HEADER, captchaSvg, captchaText, captchaToken, checkCaptcha, readCaptchaHeader, usedId } from "./captcha";

/**
 * Issuing and checking the picture code (patch P46). Signed with the auth
 * secret, so no extra setting is needed. ESIM_CAPTCHA=off turns it off.
 *
 * When the store has Cloudflare Turnstile (Settings › Payments, the keys the
 * checkout uses) the forms show Turnstile instead, and the request carries
 * its token in `x-turnstile`; Cloudflare uses each token up itself.
 */

export const TURNSTILE_HEADER = "x-turnstile";

/** The Turnstile site key the sign-in and sign-up forms show, or null for the picture code. */
export async function signInTurnstileKey(): Promise<string | null> {
  return turnstileSiteKey(await getSettings());
}

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set");
  return value;
}

export const captchaEnabled = () => (process.env.ESIM_CAPTCHA ?? "").trim().toLowerCase() !== "off";

export function issueCaptcha(): { token: string; image: string } {
  const text = captchaText();
  return { token: captchaToken(secret(), text), image: `data:image/svg+xml;base64,${Buffer.from(captchaSvg(text)).toString("base64")}` };
}

/**
 * The request's picture code is right, not run out and not used before; it
 * is then used up. False otherwise.
 */
export async function consumeCaptcha(headers: Headers | null | undefined): Promise<boolean> {
  const settings = await getSettings();
  if (turnstileSiteKey(settings)) {
    const clientIp = headers?.get("cf-connecting-ip") || headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    return (await verifyTurnstileToken({ settings, token: headers?.get(TURNSTILE_HEADER), clientIp })).ok;
  }
  const { token, answer } = readCaptchaHeader(headers?.get(CAPTCHA_HEADER));
  const check = checkCaptcha(secret(), token, answer);
  if (!check.ok) return false;
  await connectDB();
  try {
    await EsimCaptchaUse.create({ key: usedId(check.claims.id), expiresAt: new Date(check.claims.exp) });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return false;
    throw error;
  }
}

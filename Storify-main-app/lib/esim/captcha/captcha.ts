import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * The picture code on the sign-in and sign-up forms (patch P46).
 *
 * A challenge is a few letters drawn as an SVG and a token that carries, signed,
 * a hash of the answer, when it runs out and a one-time id. Nothing is stored
 * until it is used: checking a token records its id (lib/esim/captcha/service.ts)
 * so the same picture cannot be answered twice. Pure apart from the clock and
 * randomness, so it is tested without a database.
 */

/** No 0/O, 1/I/L, 2/Z, 5/S, 8/B: letters a shopper cannot tell apart. */
const ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
export const CAPTCHA_LENGTH = 4;
export const CAPTCHA_TTL_MS = 5 * 60_000;

export interface CaptchaClaims {
  /** One-time id. */
  id: string;
  /** Milliseconds. */
  exp: number;
}

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");
const answerHash = (secret: string, id: string, answer: string) =>
  createHmac("sha256", secret).update(`${id}:${answer.trim().toUpperCase()}`).digest("base64url");
const sign = (secret: string, body: string) => createHmac("sha256", secret).update(`captcha:${body}`).digest("base64url");

export function captchaText(length = CAPTCHA_LENGTH): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function captchaToken(secret: string, answer: string, now = Date.now()): string {
  const id = b64(randomBytes(12));
  const body = b64(JSON.stringify({ id, exp: now + CAPTCHA_TTL_MS, h: answerHash(secret, id, answer) }));
  return `${body}.${sign(secret, body)}`;
}

export type CaptchaCheck = { ok: true; claims: CaptchaClaims } | { ok: false; reason: "missing" | "malformed" | "expired" | "wrong" };

/** The token's signature, age and answer; whether it was used before is the caller's. */
export function checkCaptcha(secret: string, token: string, answer: string, now = Date.now()): CaptchaCheck {
  if (!token || !answer) return { ok: false, reason: "missing" };
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return { ok: false, reason: "malformed" };
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "malformed" };
  let claims: { id?: unknown; exp?: unknown; h?: unknown };
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims.id !== "string" || typeof claims.exp !== "number" || typeof claims.h !== "string") return { ok: false, reason: "malformed" };
  if (claims.exp < now) return { ok: false, reason: "expired" };
  const want = Buffer.from(claims.h);
  const got = Buffer.from(answerHash(secret, claims.id, answer));
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: "wrong" };
  return { ok: true, claims: { id: claims.id, exp: claims.exp } };
}

/** The header the forms send: "<token>|<answer>". */
export const CAPTCHA_HEADER = "x-captcha";

export function readCaptchaHeader(value: string | null | undefined): { token: string; answer: string } {
  const text = String(value ?? "");
  const cut = text.lastIndexOf("|");
  return cut < 0 ? { token: "", answer: "" } : { token: text.slice(0, cut), answer: text.slice(cut + 1).slice(0, 12) };
}

/** A stable id for a used token, so the stored record says nothing about the answer. */
export const usedId = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 32);

/** The letters drawn crooked over noise; an SVG string. */
export function captchaSvg(text: string): string {
  const width = 132;
  const height = 44;
  const r = (min: number, max: number) => min + randomInt(Math.round((max - min) * 100) + 1) / 100;
  const color = () => `hsl(${randomInt(360)},${45 + randomInt(25)}%,${30 + randomInt(15)}%)`;
  const parts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    parts.push(`<path d="M${r(0, width)} ${r(0, height)} Q${r(0, width)} ${r(0, height)} ${r(0, width)} ${r(0, height)}" stroke="${color()}" stroke-width="${r(1, 2)}" fill="none" opacity="0.6"/>`);
  }
  for (let i = 0; i < 30; i += 1) parts.push(`<circle cx="${r(0, width)}" cy="${r(0, height)}" r="${r(0.6, 1.6)}" fill="${color()}" opacity="0.5"/>`);
  const step = (width - 20) / text.length;
  [...text].forEach((char, index) => {
    const x = 12 + step * index + r(0, step - 22);
    const y = r(30, 36);
    parts.push(
      `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Verdana,Arial,sans-serif" font-size="${r(24, 30).toFixed(1)}" font-weight="700" fill="${color()}" transform="rotate(${r(-25, 25).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${char}</text>`,
    );
  });
  for (let i = 0; i < 2; i += 1) {
    parts.push(`<path d="M0 ${r(10, 34)} C${r(30, 50)} ${r(0, 44)} ${r(80, 100)} ${r(0, 44)} ${width} ${r(10, 34)}" stroke="${color()}" stroke-width="1.6" fill="none"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f4f4f5"/>${parts.join("")}</svg>`;
}

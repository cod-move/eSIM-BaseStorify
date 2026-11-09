import "server-only";

import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { captchaEnabled, consumeCaptcha } from "./service";

/**
 * Better Auth checks the picture code before an email sign-in or sign-up
 * (patch P46): listed first, so a wrong code costs no password hash and is
 * answered 400 — not the 401 a wrong password gets, so it never counts
 * toward the sign-in lockout (app/api/auth/[...all]/route.ts).
 *
 * Left alone: calls made on the server (no request), and the shopper app
 * (it sends `expo-origin`), which has no picture-code screen yet.
 */
export function pictureCodeGuard(): BetterAuthPlugin {
  return {
    id: "esim-picture-code",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/sign-in/email" || ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            if (!captchaEnabled()) return;
            const headers = ctx.request?.headers ?? ctx.headers;
            if (!ctx.request || !headers || headers.get("expo-origin")) return;
            if (await consumeCaptcha(headers)) return;
            throw new APIError("BAD_REQUEST", { message: "The picture code is wrong or has run out.", code: "CAPTCHA_INVALID" });
          }),
        },
      ],
    },
  };
}

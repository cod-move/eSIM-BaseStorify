"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { TurnstileCheck } from "@/components/checkout/turnstile-check";

/**
 * The picture code under the email and password on the sign-in and sign-up
 * forms (patch P46). The form sends what was typed with its request
 * (`captchaHeaders`); Better Auth checks it before anything else
 * (lib/auth/auth.ts). A refused or used code draws a new picture.
 *
 * The field the shopper typed in last is the one sent, so a sign-in drawer
 * kept mounted behind the sign-in page does not get in the way.
 *
 * A store with Cloudflare Turnstile gets that instead of the picture: its
 * token goes in `x-turnstile`, and a used or refused one draws a new check.
 */

const HEADER = "x-captcha";
let current: { token: string; answer: string } | null = null;
let turnstileToken = "";
let enabled = true;
const listeners = new Set<(error: boolean) => void>();

/** Headers for `signIn.email` / `signUp.email`. */
export function captchaHeaders(): Record<string, string> {
  if (!enabled) return {};
  if (turnstileToken) return { "x-turnstile": turnstileToken };
  if (!current) return {};
  return { [HEADER]: `${current.token}|${current.answer}` };
}

/** The server said the code was wrong, run out or used: a new picture, and say so. */
export function captchaRejected() {
  current = null;
  turnstileToken = "";
  listeners.forEach((listener) => listener(true));
}

/** After a request that used the code (it is used up either way): a new picture. */
export function captchaUsed() {
  current = null;
  turnstileToken = "";
  listeners.forEach((listener) => listener(false));
}

export const isCaptchaError = (error: { code?: unknown } | null | undefined) => error?.code === "CAPTCHA_INVALID";

export function CaptchaField({ disabled }: { disabled?: boolean }) {
  const t = useFallbackTranslator(useTranslations());
  const [challenge, setChallenge] = useState<{ token: string; image: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [show, setShow] = useState(true);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  /** Bumped to draw a fresh Turnstile check after one is used. */
  const [round, setRound] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/esim/captcha", { cache: "no-store" });
      const body = (await response.json()) as { enabled: boolean; token?: string; image?: string; turnstile?: string };
      enabled = body.enabled;
      setShow(body.enabled);
      if (body.turnstile) {
        turnstileToken = "";
        setSiteKey(body.turnstile);
        setRound((value) => value + 1);
        return;
      }
      if (body.enabled && body.token && body.image) {
        setChallenge({ token: body.token, image: body.image });
        current = { token: body.token, answer: "" };
      }
      setAnswer("");
    } catch {
      setChallenge(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const listener = (failed: boolean) => {
      setError(failed);
      void load();
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [load]);

  if (!show) return null;
  if (siteKey) {
    return (
      <div className="space-y-2">
        <TurnstileCheck
          key={round}
          siteKey={siteKey}
          onToken={(token) => {
            turnstileToken = token;
            if (token) setError(false);
          }}
          label={t("esim.captcha.turnstile", "Quick check that you are not a robot")}
        />
        {error ? <p className="text-sm text-destructive">{t("esim.captcha.turnstileFailed", "The check did not pass. Please complete it again.")}</p> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="esim-captcha">
        {t("esim.captcha.label", "Picture code")}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <ShieldCheck className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="esim-captcha"
            value={answer}
            onChange={(event) => {
              const value = event.target.value.replace(/\s+/g, "").slice(0, 8);
              setAnswer(value);
              setError(false);
              if (challenge) current = { token: challenge.token, answer: value };
            }}
            onFocus={() => {
              if (challenge) current = { token: challenge.token, answer };
            }}
            placeholder={t("esim.captcha.placeholder", "Type the characters")}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={8}
            className="pl-10 uppercase"
            disabled={disabled}
            aria-invalid={error}
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex h-10 shrink-0 items-center gap-1 overflow-hidden rounded-md border bg-muted"
          title={t("esim.captcha.refresh", "New picture")}
          aria-label={t("esim.captcha.refresh", "New picture")}
          disabled={loading}
        >
          {challenge ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={challenge.image} alt={t("esim.captcha.alt", "Picture code")} width={120} height={40} className="h-10 w-[120px]" />
          ) : (
            <span className="flex h-10 w-[120px] items-center justify-center">
              <RefreshCw className={`h-4 w-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
            </span>
          )}
        </button>
      </div>
      {error ? <p className="text-sm text-destructive">{t("esim.captcha.invalid", "The picture code is wrong or has run out. Please type the new one.")}</p> : null}
    </div>
  );
}

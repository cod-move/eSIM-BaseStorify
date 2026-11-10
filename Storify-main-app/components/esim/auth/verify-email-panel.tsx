"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, MailCheck, MailWarning } from "lucide-react";
import Link from "@/components/language/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useFallbackTranslator } from "@/hooks/use-fallback-translator";
import { useLocaleHref } from "@/hooks/use-locale-navigation";

/**
 * "Check your email" after sign-up (patch P47): the official panel, in the
 * shopper's language, telling them to look in their spam folder too.
 */
export function EsimVerifyEmailPanel({ email, locale }: { email: string; locale: string }) {
  const t = useFallbackTranslator(useTranslations());
  const localeHref = useLocaleHref();
  const [address, setAddress] = useState(email);
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const resend = async () => {
    if (!address) return;
    setIsSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: address, callbackURL: localeHref(`/${locale}/email-verified`) }),
      });
      if (!response.ok) throw new Error();
      setMessage(t("esim.verifyEmail.resent", "A fresh verification link has been sent if this account still needs verification. Check your spam folder too."));
    } catch {
      setMessage(t("esim.verifyEmail.resendFailed", "We could not send another link right now. Please try again shortly."));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center">
        <MailCheck className="mx-auto mb-2 h-10 w-10 text-store-link" />
        <CardTitle>{t("esim.verifyEmail.title", "Check your email")}</CardTitle>
        <CardDescription>
          {address ? (
            <>
              {t("esim.verifyEmail.sentTo", "We sent a verification link to")} <strong className="break-all">{address}</strong>
            </>
          ) : (
            t("esim.verifyEmail.sent", "We sent a verification link to your email address.")
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-center text-sm text-muted-foreground">
        <p>{t("esim.verifyEmail.open", "Open the link to verify your email and activate your account. The link expires in 24 hours.")}</p>
        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-left text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
          <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("esim.verifyEmail.spam", "Not in your inbox? Look in your spam or junk folder, and mark the email as \"not spam\" so later emails arrive. It can take a few minutes.")}</p>
        </div>
        <Input
          type="email"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="you@example.com"
          aria-label={t("esim.verifyEmail.emailLabel", "Email address")}
        />
        {message && <p className="rounded-md bg-muted p-3 text-foreground">{message}</p>}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button className="w-full" type="button" onClick={() => void resend()} disabled={isSending || !address}>
          {isSending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("esim.verifyEmail.resend", "Resend verification email")}
        </Button>
        <Button className="w-full" variant="outline" asChild>
          <Link href="/login">{t("esim.verifyEmail.backToSignIn", "Back to sign in")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

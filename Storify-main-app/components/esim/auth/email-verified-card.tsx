import { CheckCircle2, CircleX } from "lucide-react";
import Link from "@/components/language/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { translator } from "@/lib/esim/i18n/server";

/** Where the verification link lands (patch P47): the official card, in the shopper's language. */
export async function EsimEmailVerifiedCard({ locale, failed }: { locale: string; failed: boolean }) {
  const t = await translator(locale);
  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center">
        {failed ? <CircleX className="mx-auto mb-2 h-10 w-10 text-destructive" /> : <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-600" />}
        <CardTitle>{failed ? t("esim.verifyEmail.invalidTitle", "Verification link is invalid") : t("esim.verifyEmail.doneTitle", "Email verified")}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        {failed
          ? t("esim.verifyEmail.invalid", "This link may have expired or already been replaced. Request a new verification email and try again.")
          : t("esim.verifyEmail.done", "Your email address is verified and your account is ready. Continue, and sign in if you are asked to.")}
      </CardContent>
      <CardFooter>
        <Button className="w-full" asChild>
          <Link href={failed ? `/${locale}/verify-email` : `/${locale}/role-redirect`}>
            {failed ? t("esim.verifyEmail.requestAnother", "Request another link") : t("esim.verifyEmail.continue", "Continue")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

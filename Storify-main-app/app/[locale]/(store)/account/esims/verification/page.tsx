import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, ChevronLeft, Clock, XCircle } from "lucide-react";
import Link from "@/components/language/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { connectDB } from "@/lib/db";
import { getAccountSession } from "@/lib/customers/account-data";
import { currentKycForm, kycState } from "@/lib/esim/kyc/service";
import { KycForm } from "@/components/esim/kyc-form";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Identity verification (KYC-02): where it stands, and the form when there
 * is nothing waiting or it was not passed. Some eSIMs can be bought only
 * once it is approved (KYC-03); checkout points here.
 */
export default async function AccountVerificationPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tr = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t.has(key) ? t(key, values) : fallback.replace(/\{(\w+)\}/g, (_, name) => String(values?.[name] ?? ""));
  const session = await getAccountSession();
  if (!session) notFound();
  await connectDB();
  const [state, form] = await Promise.all([kycState(session.user.id), currentKycForm()]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const canSubmit = state.status === "none" || state.status === "rejected";

  return (
    <div className="space-y-6">
      <Link href="/account/esims" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        {tr("esim.account.back", "My eSIMs")}
      </Link>
      <div className="space-y-1">
        <h1 className="text-xl font-bold sm:text-2xl">{tr("esim.kyc.title", "Identity verification")}</h1>
        <p className="text-sm text-muted-foreground">{tr("esim.kyc.why", "Some countries' networks need to know who uses an eSIM. Verify once, and every eSIM that needs it can be bought.")}</p>
      </div>

      {state.status === "approved" ? (
        <Card><CardContent className="flex items-center gap-3 pt-6 text-sm"><CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />{tr("esim.kyc.approved", "Your identity is verified.")}</CardContent></Card>
      ) : state.status === "pending" ? (
        <Card><CardContent className="flex items-center gap-3 pt-6 text-sm"><Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />{tr("esim.kyc.pending", "Sent on {date}. We are checking it and will let you know.", { date: state.submittedAt ? date.format(state.submittedAt) : "" })}</CardContent></Card>
      ) : state.status === "rejected" ? (
        <Card><CardContent className="flex items-start gap-3 pt-6 text-sm"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div>{tr("esim.kyc.rejected", "Not passed: {reason}. Please send your details again.", { reason: state.reason ?? "" })}</div></CardContent></Card>
      ) : null}

      {canSubmit ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{tr("esim.kyc.yourDetails", "Your details")}</CardTitle></CardHeader>
          <CardContent>
            {form ? <KycForm fields={form.fields} /> : <p className="text-sm text-muted-foreground">{tr("esim.kyc.closed", "Identity verification is not open yet.")}</p>}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

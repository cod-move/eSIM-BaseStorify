// [esim-patch] P47: the eSIM panel (translated, with the spam-folder hint) in place of the official one.
import { EsimVerifyEmailPanel as VerifyEmailPanel } from "@/components/esim/auth/verify-email-panel";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <VerifyEmailPanel locale={locale} email={query.email || ""} />;
}

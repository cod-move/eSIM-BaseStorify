// [esim-patch] P47: the eSIM card (the official one, translated) in place of the official markup.
import { EsimEmailVerifiedCard } from "@/components/esim/auth/email-verified-card";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const failed = Boolean(query.error);
  return <EsimEmailVerifiedCard locale={locale} failed={failed} />;
}

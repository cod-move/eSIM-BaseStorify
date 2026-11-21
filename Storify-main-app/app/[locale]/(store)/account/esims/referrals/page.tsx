import { redirect } from "next/navigation";
import { localeHref } from "@/lib/i18n/locale-routing";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** The referral centre (REF-05) now lives in the rewards centre's "Invite friends" tab; old links (emails, notices) land there. */
export default async function AccountReferralsPage({ params }: PageProps) {
  const { locale } = await params;
  redirect(await localeHref(locale, "/account/esims/rewards"));
}

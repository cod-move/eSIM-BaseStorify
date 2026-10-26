import { redirect } from "next/navigation";
import { localeHref } from "@/lib/i18n/locale-routing";

/** /admin/esim opens the plan library. */
export default async function AdminEsimPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(await localeHref(locale, "/admin/esim/plans"));
}

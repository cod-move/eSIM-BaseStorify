import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getDestinationMapping } from "@/lib/esim/admin/destinations";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimMappingAdmin } from "@/components/esim/admin/mapping-admin";

/** One destination's variants and the supplier plans behind each (ADM-06). */
export default async function AdminEsimDestinationPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const mapping = await getDestinationMapping(decodeURIComponent(slug));
  if (!mapping) notFound();
  return <EsimMappingAdmin mapping={mapping} canManage={canManage} />;
}

import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getDestinationMapping, getDestinationNames } from "@/lib/esim/admin/destinations";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimMappingAdmin } from "@/components/esim/admin/mapping-admin";
import { EsimDestinationNamesCard } from "@/components/esim/admin/destination-names-card";

/** One destination's variants and the supplier plans behind each (ADM-06), and its name in each language (WEB-01). */
export default async function AdminEsimDestinationPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const productSlug = decodeURIComponent(slug);
  const [mapping, names] = await Promise.all([getDestinationMapping(productSlug), getDestinationNames(productSlug)]);
  if (!mapping) notFound();
  return (
    <div className="space-y-4">
      <EsimMappingAdmin mapping={mapping} canManage={canManage} />
      {names ? <EsimDestinationNamesCard productSlug={mapping.productSlug} names={names} canManage={canManage} /> : null}
    </div>
  );
}

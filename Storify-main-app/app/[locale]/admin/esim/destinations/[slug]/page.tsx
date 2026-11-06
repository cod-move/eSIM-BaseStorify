import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getDestinationMapping, getDestinationNames } from "@/lib/esim/admin/destinations";
import { mergeTargets, mergedInto } from "@/lib/esim/catalog/merge";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimMappingAdmin } from "@/components/esim/admin/mapping-admin";
import { EsimDestinationNamesCard } from "@/components/esim/admin/destination-names-card";
import { EsimDestinationMergeCard } from "@/components/esim/admin/destination-merge-card";

/**
 * One destination's variants and the supplier plans behind each (ADM-06), its
 * name in each language (WEB-01), and merging it into another.
 */
export default async function AdminEsimDestinationPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const productSlug = decodeURIComponent(slug);
  const [mapping, names, targets, mergedHere] = await Promise.all([
    getDestinationMapping(productSlug),
    getDestinationNames(productSlug),
    mergeTargets(productSlug),
    mergedInto(productSlug),
  ]);
  if (!mapping) notFound();
  return (
    <div className="space-y-4">
      <EsimMappingAdmin mapping={mapping} canManage={canManage} />
      {names ? <EsimDestinationNamesCard productSlug={mapping.productSlug} names={names} canManage={canManage} /> : null}
      <EsimDestinationMergeCard
        productSlug={mapping.productSlug}
        name={names?.supplierName ?? mapping.name}
        targets={targets}
        mergedHere={mergedHere}
        canManage={canManage}
      />
    </div>
  );
}

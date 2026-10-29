import { setRequestLocale } from "next-intl/server";
import { listCampaigns } from "@/lib/esim/campaigns/service";
import { listDestinations } from "@/lib/esim/storefront/catalog";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimCampaignsAdmin } from "@/components/esim/admin/campaigns-admin";

interface PageProps {
  params: Promise<{ locale: string }>;
}

/** Admin → eSIM → Campaigns (CAT-11): campaign pages with a coupon code for chosen destinations. */
export default async function AdminEsimCampaignsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const [campaigns, destinations] = await Promise.all([listCampaigns(), listDestinations()]);
  return (
    <EsimCampaignsAdmin
      campaigns={campaigns}
      destinations={destinations.map((destination) => ({ slug: destination.slug, name: destination.name, scope: destination.scope }))}
      canManage={canManage}
    />
  );
}

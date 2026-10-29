import { setRequestLocale } from "next-intl/server";
import { connectDB } from "@/lib/db";
import { getFxOverview, getPricingConfig } from "@/lib/esim/admin/pricing";
import { listAdminProviders } from "@/lib/esim/admin/providers";
import { getWalletSettings } from "@/lib/esim/admin/wallet";
import { getCancellationSettings } from "@/lib/esim/admin/cancellation";
import { getRiskSettings } from "@/lib/esim/admin/risk";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimPricingAdmin } from "@/components/esim/admin/pricing-admin";
import { EsimWalletSettingsCard } from "@/components/esim/admin/wallet-settings-card";
import { EsimCancellationSettingsCard } from "@/components/esim/admin/cancellation-settings-card";
import { EsimRiskSettingsCard } from "@/components/esim/admin/risk-settings-card";

/** Admin → eSIM → Pricing: settings, markup rules and exchange rates (ADM-04, ADM-05), and wallet top-ups (WAL-01). */
export default async function AdminEsimPricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  await connectDB();
  const [config, fx, providers, wallet, cancellation, risk] = await Promise.all([getPricingConfig(), getFxOverview(), listAdminProviders(), getWalletSettings(), getCancellationSettings(), getRiskSettings()]);
  return (
    <div className="space-y-6">
      <EsimPricingAdmin
        config={config}
        fx={fx}
        providers={providers.map((provider) => ({ code: provider.code, name: provider.name }))}
        canManage={canManage}
      />
      <EsimWalletSettingsCard settings={wallet} canManage={canManage} />
      <EsimCancellationSettingsCard settings={cancellation} canManage={canManage} />
      <EsimRiskSettingsCard settings={risk} canManage={canManage} />
    </div>
  );
}

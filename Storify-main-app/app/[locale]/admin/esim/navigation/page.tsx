import { setRequestLocale } from "next-intl/server";
import { getLocaleRouting } from "@/lib/i18n/locale-routing";
import { getMobileMenuSettings, getMobileNavSettings } from "@/lib/esim/admin/mobile-nav";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { MobileNavCard } from "@/components/esim/admin/mobile-nav-card";
import { MobileMenuCard } from "@/components/esim/admin/mobile-menu-card";

/** Admin → eSIM → Mobile navigation: the storefront's bottom tab bar (patch P32) and side menu (patch P33) on phones and tablets. */
export default async function AdminEsimNavigationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  const [tabs, menu, routing] = await Promise.all([getMobileNavSettings(), getMobileMenuSettings(), getLocaleRouting()]);
  const locales = [...routing.enabled];
  return (
    <div className="space-y-6">
      <MobileNavCard settings={tabs} locales={locales} canManage={canManage} />
      <MobileMenuCard settings={menu} locales={locales} canManage={canManage} />
    </div>
  );
}

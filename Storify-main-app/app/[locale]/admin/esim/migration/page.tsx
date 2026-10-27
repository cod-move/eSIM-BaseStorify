import { setRequestLocale } from "next-intl/server";
import { migrationStatus } from "@/lib/esim/admin/migration";
import { esimPageAccess } from "@/lib/esim/admin/page-access";
import { EsimMigrationAdmin } from "@/components/esim/admin/migration-admin";

/** Admin → eSIM → Migration (MIG): check and import the old store's shoppers, balances and eSIMs. */
export default async function AdminEsimMigrationPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { canManage } = await esimPageAccess(locale);
  return <EsimMigrationAdmin status={await migrationStatus()} canManage={canManage} />;
}

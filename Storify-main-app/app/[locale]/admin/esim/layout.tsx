import { requireAdminArea } from "@/lib/access/admin-page-guard";

/**
 * Opens /admin/esim to the administrators whose team role holds an eSIM
 * permission (patch P6); anyone else lands on the first area they do reach.
 */
export default async function AdminEsimAreaLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdminArea(locale, "/admin/esim");
  return children;
}

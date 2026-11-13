import { setRequestLocale } from "next-intl/server";
import { CustomerDetailShell } from "@/components/admin/customers/customer-detail-shell";
import { requireStaffAreaAccess } from "@/lib/access/staff-area-guard";
import { STAFF_PERMISSIONS } from "@/config/permissions.config";
import { customerPageId } from "@/lib/esim/admin/customer-id"; // [esim-patch] P63

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function StaffCustomerDetailsPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const access = await requireStaffAreaAccess({
    locale,
    required: [STAFF_PERMISSIONS.VIEW_CUSTOMERS],
  });

  const canManageCustomers = access.staffPermissions.includes(
    STAFF_PERMISSIONS.MANAGE_CUSTOMERS,
  ) ||
    access.staffPermissions.includes(STAFF_PERMISSIONS.EDIT_CUSTOMERS) ||
    access.staffPermissions.includes(STAFF_PERMISSIONS.DELETE_CUSTOMERS);

  const canSendAccountEmail =
    access.staffPermissions.includes(STAFF_PERMISSIONS.MANAGE_CUSTOMERS) ||
    access.staffPermissions.includes(STAFF_PERMISSIONS.EDIT_CUSTOMERS);

  // [esim-patch] P63 a notification's link carries the account's user id: open its customer profile.
  const customerId = await customerPageId(id);

  return (
    <CustomerDetailShell
      locale={locale}
      customerId={customerId}
      readOnly={!canManageCustomers}
      area="staff"
      emailLocked
      canSendAccountEmail={canSendAccountEmail}
    />
  );
}

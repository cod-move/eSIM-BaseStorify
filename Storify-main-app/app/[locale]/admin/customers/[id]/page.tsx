import { setRequestLocale } from "next-intl/server";
import { CustomerDetailShell } from "@/components/admin/customers/customer-detail-shell";
import { requireAdminOrStaffPageAccess } from "@/lib/access/staff-page-guard";
import { STAFF_PERMISSIONS } from "@/config/permissions.config";
import { USER_ROLES } from "@/config/app.config";
import { customerPageId } from "@/lib/esim/admin/customer-id"; // [esim-patch] P63

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function CustomerDetailsPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const access = await requireAdminOrStaffPageAccess({
    locale,
    required: [STAFF_PERMISSIONS.VIEW_CUSTOMERS],
  });

  const canManageCustomers =
    access.session.user.role === USER_ROLES.ADMIN ||
    access.staffPermissions?.includes(STAFF_PERMISSIONS.MANAGE_CUSTOMERS) ||
    access.staffPermissions?.includes(STAFF_PERMISSIONS.EDIT_CUSTOMERS) ||
    access.staffPermissions?.includes(STAFF_PERMISSIONS.DELETE_CUSTOMERS) ||
    false;

  // The account email reaches the shopper's login, so it is an edit of the
  // customer — the permission the route itself asks for.
  const canSendAccountEmail =
    access.session.user.role === USER_ROLES.ADMIN ||
    access.staffPermissions?.includes(STAFF_PERMISSIONS.MANAGE_CUSTOMERS) ||
    access.staffPermissions?.includes(STAFF_PERMISSIONS.EDIT_CUSTOMERS) ||
    false;

  // [esim-patch] P63 a notification's link carries the account's user id: open its customer profile.
  const customerId = await customerPageId(id);

  return (
    <CustomerDetailShell
      locale={locale}
      customerId={customerId}
      readOnly={!canManageCustomers}
      emailLocked={access.session.user.role !== USER_ROLES.ADMIN}
      canSendAccountEmail={canSendAccountEmail}
    />
  );
}

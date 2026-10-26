/**
 * The eSIM area's team permissions (patch P6): View opens the eSIM admin
 * pages, Manage changes suppliers, plans and prices. Pure — the role editor
 * and the sidebar read it on the client.
 */
export const ESIM_ADMIN_AREA_PERMISSIONS = {
  VIEW_ESIM: "view_esim",
  MANAGE_ESIM: "manage_esim",
} as const;

export const ESIM_VIEW = [ESIM_ADMIN_AREA_PERMISSIONS.VIEW_ESIM, ESIM_ADMIN_AREA_PERMISSIONS.MANAGE_ESIM] as const;
export const ESIM_MANAGE = [ESIM_ADMIN_AREA_PERMISSIONS.MANAGE_ESIM] as const;

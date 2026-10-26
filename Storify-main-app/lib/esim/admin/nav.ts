/**
 * The "eSIM" group of the admin sidebar (patch P5). Icon names are keys of
 * the sidebar's own icon map; labels are message keys (locales/esim/*.json).
 */
export const ESIM_ADMIN_NAV = {
  label: "admin.sidebar.esim",
  href: "/admin/esim/plans",
  icon: "Globe",
  items: [
    { label: "admin.sidebar.esimPlans", href: "/admin/esim/plans", icon: "ListTree" },
    { label: "admin.sidebar.esimPricing", href: "/admin/esim/pricing", icon: "Percent" },
    { label: "admin.sidebar.esimProviders", href: "/admin/esim/providers", icon: "Landmark" },
  ],
};

/**
 * The "eSIM" group of the admin sidebar (patch P5). Icon names are keys of
 * the sidebar's own icon map; labels are message keys (locales/esim/*.json).
 */
export const ESIM_ADMIN_NAV = {
  label: "admin.sidebar.esim",
  href: "/admin/esim/plans",
  icon: "Globe",
  items: [
    { label: "admin.sidebar.esimEsims", href: "/admin/esim/esims", icon: "ListOrdered" },
    { label: "admin.sidebar.esimProblems", href: "/admin/esim/problems", icon: "ShieldCheck" },
    { label: "admin.sidebar.esimTopups", href: "/admin/esim/topups", icon: "CreditCard" },
    { label: "admin.sidebar.esimReferrals", href: "/admin/esim/referrals", icon: "Gift" },
    { label: "admin.sidebar.esimDestinations", href: "/admin/esim/destinations", icon: "MapPin" },
    { label: "admin.sidebar.esimPlans", href: "/admin/esim/plans", icon: "ListTree" },
    { label: "admin.sidebar.esimPricing", href: "/admin/esim/pricing", icon: "Percent" },
    { label: "admin.sidebar.esimProviders", href: "/admin/esim/providers", icon: "Landmark" },
    { label: "admin.sidebar.esimDevices", href: "/admin/esim/devices", icon: "SlidersHorizontal" },
    { label: "admin.sidebar.esimJobs", href: "/admin/esim/jobs", icon: "CalendarClock" },
    { label: "admin.sidebar.esimLogs", href: "/admin/esim/logs", icon: "History" },
  ],
};

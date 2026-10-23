import type { IconName } from '@/components/ui/icon';

/**
 * How the app is laid out: the tabs, the home header's buttons and the account
 * menu, with the design's defaults.
 *
 * Navigation is data, not code, so that the merchant can later arrange it from
 * the store's admin: the same object will
 * then arrive in `GET /config`, be checked (at most five tabs, Home and Account
 * always there, destinations the app does not know dropped), and fall back to
 * these defaults. Screens read it from here and never list their own.
 */

/**
 * The places a tab, a button or a menu row can lead to, each with its path
 * (the website's, where the screen has one), its icon and its label. A
 * destination that waits for a later release names its capability, and is
 * left out where the backend lacks it (the capability check reads `describeItem(item).capability`).
 */
const DESTINATIONS = {
  home: { href: '/', icon: 'home', label: 'tabs.home' },
  search: { href: '/search', icon: 'search', label: 'tabs.search' },
  categories: { href: '/categories', icon: 'grid', label: 'tabs.categories' },
  cart: { href: '/cart', icon: 'cart', label: 'tabs.cart' },
  account: { href: '/account', icon: 'user', label: 'tabs.account' },
  wishlist: { href: '/account/wishlist', icon: 'heart', label: 'shell.destinations.wishlist' },
  notifications: {
    href: '/account/notifications',
    icon: 'bell',
    label: 'shell.destinations.notifications',
  },
  messages: {
    href: '/account/inbox',
    icon: 'chat',
    label: 'shell.destinations.messages',
    capability: 'support.chat',
  },
  reviews: {
    href: '/account/reviews',
    icon: 'star',
    label: 'shell.destinations.reviews',
    capability: 'reviews.mine',
  },
  promos: { href: '/account/promos', icon: 'ticket', label: 'shell.destinations.promos' },
  /** The store's questions and answers; a web page in v1. */
  help: { href: '/faq', icon: 'help', label: 'shell.destinations.help' },
  orders: { href: '/account/orders', icon: 'receipt', label: 'shell.destinations.orders' },
  returns: {
    href: '/account/returns',
    icon: 'return',
    label: 'shell.destinations.returns',
    capability: 'orders.returns',
  },
  /** The orders on their way, not yet delivered. */
  tracking: { href: '/account/tracking', icon: 'map', label: 'shell.destinations.tracking' },
  profile: { href: '/account/profile', icon: 'user', label: 'shell.destinations.profile' },
  preferences: {
    href: '/account/preferences',
    icon: 'filter',
    label: 'shell.destinations.preferences',
  },
  addresses: { href: '/account/addresses', icon: 'pin', label: 'shell.destinations.addresses' },
  security: { href: '/account/security', icon: 'lock', label: 'shell.destinations.security' },
  /** The store's policies; web pages in v1. */
  privacy: { href: '/privacy', icon: 'shield', label: 'shell.destinations.privacy' },
  settings: {
    href: '/account/settings',
    icon: 'appearance',
    label: 'shell.destinations.settings',
  },
} as const satisfies Record<
  string,
  { href: string; icon: IconName; label: `${'tabs' | 'shell'}.${string}`; capability?: string }
>;

export type Destination = keyof typeof DESTINATIONS;

/**
 * The destinations that are tabs: each is a group of `src/app/(tabs)` with a
 * stack of its own. Home's group sorts first: see `src/app/(tabs)/_layout.tsx`.
 */
export const TAB_ROUTES = {
  home: '(1-home)',
  search: '(2-search)',
  categories: '(3-categories)',
  cart: '(4-cart)',
  account: '(5-account)',
} as const satisfies Partial<Record<Destination, string>>;

export type TabDestination = keyof typeof TAB_ROUTES;

/** A count the app shows on a tab or a button, read by whoever draws it. */
export type BadgeKind = 'cart' | 'notifications' | 'messages' | 'tracking';

/** One tab, button or row. */
export type NavItem<D extends Destination = Destination> = {
  destination: D;
  /** The store's own label, already in the shopper's language; else the app's. */
  label?: string;
  /** Another of the app's icons; else the destination's. */
  icon?: IconName;
  badge?: BadgeKind;
};

export type AppLayout = {
  /** The tab bar, in order: at most five. */
  tabs: NavItem<TabDestination>[];
  /** The buttons at the end of the home screen's header. */
  homeHeader: NavItem[];
  /** The Account tab. */
  accountMenu: {
    /** The header's buttons, beside the shopper's name. */
    header: NavItem[];
    /** The four tiles under the header. */
    tiles: NavItem[];
    /** "Purchases": two tiles in one card, then a full-width one. */
    purchases: NavItem[];
    tracking: NavItem;
    /** The list of rows, before "Sign Out". */
    rows: NavItem[];
  };
};

/** The design's layout. Search and Categories are tabs; the wishlist opens from Home and Account. */
export const APP_LAYOUT: AppLayout = {
  tabs: [
    { destination: 'home' },
    { destination: 'search' },
    { destination: 'categories' },
    { destination: 'cart', badge: 'cart' },
    { destination: 'account' },
  ],
  homeHeader: [{ destination: 'wishlist' }, { destination: 'cart', badge: 'cart' }],
  accountMenu: {
    header: [
      { destination: 'notifications', badge: 'notifications' },
      { destination: 'messages', badge: 'messages' },
    ],
    tiles: [
      { destination: 'wishlist' },
      { destination: 'reviews' },
      { destination: 'promos' },
      { destination: 'help' },
    ],
    purchases: [{ destination: 'orders' }, { destination: 'returns' }],
    tracking: { destination: 'tracking', badge: 'tracking' },
    rows: [
      { destination: 'profile' },
      { destination: 'preferences' },
      { destination: 'addresses' },
      { destination: 'security' },
      { destination: 'privacy' },
      { destination: 'settings' },
    ],
  },
};

/** Where an item leads, and how it looks: the item's own label and icon, else its destination's. */
export function describeItem(item: NavItem) {
  const destination = DESTINATIONS[item.destination];
  return {
    href: destination.href,
    icon: item.icon ?? destination.icon,
    /** A message key, for when the item has no label of its own. */
    labelKey: destination.label,
    label: item.label,
    capability: 'capability' in destination ? destination.capability : undefined,
  };
}

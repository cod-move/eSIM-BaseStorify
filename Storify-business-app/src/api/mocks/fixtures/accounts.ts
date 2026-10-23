/**
 * The mock store's people and sellers: who can sign in, and what each may do
 * where. Every password is `password`.
 *
 * | Email                       | Who                                                           |
 * | --------------------------- | ------------------------------------------------------------- |
 * | `admin@example.com`         | The store's owner, an administrator                           |
 * | `two-step@example.com`      | An administrator with two-step verification (code `123456`)   |
 * | `staff@example.com`         | The store's staff: sees orders, products, the inbox; no cancel, no price changes, no replies |
 * | `warehouse@example.com`     | The store's staff at the Main warehouse only: its products, and their stock there |
 * | `seller@example.com`        | The seller Green Leaf Goods: their orders, products, inbox and payouts |
 * | `seller-staff@example.com`  | Green Leaf Goods' staff: whole orders of their seller only; their customers, no notes; replies and inbox notes, but no assigning or resolving |
 * | `unpaid-seller@example.com` | Blue Harbor Crafts, approved but awaiting its first payment: the catalogue only |
 * | `both@example.com`          | Two workspaces (the store's staff and Green Leaf's): the app asks which |
 * | `no-access@example.com`     | A staff member whose access was switched off: no workspace     |
 * | `shopper@example.com`       | A customer: the business app refuses them at sign-in           |
 *
 * Backup codes of `two-step@example.com`: `ABCDE-12345`, `FGHIJ-67890` (each once).
 */
import type { Capability, Workspace, WorkspaceVendor } from '@/contracts/mobile/biz/v1';

import { image } from './shared';

/** Every account's password. */
export const MOCK_PASSWORD = 'password';
/** The code the authenticator app of an account with two-step verification always shows. */
export const MOCK_TOTP_CODE = '123456';

export type MockVendor = {
  id: string;
  name: string;
  /** The store's own word: `approved`, `payment_required`, `suspended` … */
  status: string;
  packs: string[];
  /** Where the seller keeps stock. */
  locationIds: string[];
};

export const VENDORS: Record<string, MockVendor> = {
  vendor_green: {
    id: 'vendor_green',
    name: 'Green Leaf Goods',
    status: 'approved',
    packs: ['catalog', 'orders', 'inbox', 'payouts'],
    locationIds: ['loc_green'],
  },
  vendor_urban: {
    id: 'vendor_urban',
    name: 'Urban Thread Co.',
    status: 'approved',
    packs: ['catalog', 'orders', 'inbox', 'payouts'],
    locationIds: ['loc_urban'],
  },
  vendor_harbor: {
    id: 'vendor_harbor',
    name: 'Blue Harbor Crafts',
    status: 'payment_required',
    packs: ['catalog'],
    locationIds: ['loc_harbor'],
  },
};

/** The store's own stock, for products no seller owns. */
export const STORE_LOCATION_IDS = ['loc_main', 'loc_popup'];

/** One workspace an account can work in, as the mock keeps it. */
export type MockGrant = {
  workspace: Workspace;
  role: 'admin' | 'staff' | 'vendor';
  capabilities: Capability[];
  permissions: string[];
  scoped: boolean;
  /** The vendor workspace's seller. */
  vendorId?: string;
  /** A staff member assigned to these stock locations: the products and stock there only. */
  locationIds?: string[];
};

export type MockAccount = {
  id: string;
  email: string;
  name: string;
  /** `customer` is refused at sign-in. */
  role: 'admin' | 'staff' | 'vendor' | 'customer';
  isOwner: boolean;
  password: string;
  imageUrl?: string;
  twoFactor?: { totpCode: string; backupCodes: string[] };
  grants: MockGrant[];
};

const EVERY_PLATFORM_CAPABILITY: Capability[] = [
  'CREATE_ORDERS',
  'RECORD_ORDER_PAYMENTS',
  'VIEW_ORDER_CUSTOMERS',
  'CREATE_ORDER_CONTACTS',
  'CREATE_PRODUCTS',
  'DELETE_PRODUCTS',
  'VIEW_RETURNS',
  'HANDLE_RETURNS',
  'ISSUE_REFUNDS',
  'RECORD_REFUND_SETTLEMENT',
  'VIEW_ORDERS',
  'EDIT_ORDERS',
  'CANCEL_ORDERS',
  'VIEW_PRODUCTS',
  'EDIT_PRODUCTS',
  'VIEW_STOCK',
  'ADJUST_STOCK',
  'VIEW_INBOX',
  'REPLY_INBOX',
  'REVIEW_VENDOR_APPLICATIONS',
  'MANAGE_CUSTOMER_NOTES',
  'MANAGE_INBOX',
];

const SELLER_CAPABILITIES: Capability[] = [
  'CREATE_ORDERS',
  'RECORD_ORDER_PAYMENTS',
  'VIEW_ORDER_CUSTOMERS',
  'CREATE_PRODUCTS',
  'DELETE_PRODUCTS',
  'VIEW_RETURNS',
  'HANDLE_RETURNS',
  'RECORD_REFUND_SETTLEMENT',
  'VIEW_ORDERS',
  'EDIT_ORDERS',
  'CANCEL_ORDERS',
  'VIEW_PRODUCTS',
  'EDIT_PRODUCTS',
  'VIEW_STOCK',
  'ADJUST_STOCK',
  'VIEW_INBOX',
  'REPLY_INBOX',
  'VIEW_PAYOUTS',
  'MANAGE_CUSTOMER_NOTES',
  'MANAGE_INBOX',
];

const ADMIN_GRANT: MockGrant = {
  workspace: 'platform',
  role: 'admin',
  capabilities: EVERY_PLATFORM_CAPABILITY,
  permissions: [],
  scoped: false,
};

const PLATFORM_STAFF_GRANT: MockGrant = {
  workspace: 'platform',
  role: 'staff',
  capabilities: ['VIEW_ORDERS', 'EDIT_ORDERS', 'VIEW_PRODUCTS', 'VIEW_STOCK', 'VIEW_INBOX'],
  permissions: ['view_orders', 'edit_orders', 'view_products', 'view_inventory', 'view_inbox'],
  scoped: false,
};

/** The store's staff at one warehouse: its products, and their stock there counted in and out. */
const WAREHOUSE_STAFF_GRANT: MockGrant = {
  workspace: 'platform',
  role: 'staff',
  capabilities: ['VIEW_PRODUCTS', 'VIEW_STOCK', 'ADJUST_STOCK'],
  permissions: ['view_products', 'view_inventory', 'edit_inventory'],
  scoped: true,
  locationIds: ['loc_main'],
};

const GREEN_STAFF_GRANT: MockGrant = {
  workspace: 'vendor',
  role: 'staff',
  capabilities: [
    'VIEW_ORDERS',
    'EDIT_ORDERS',
    'VIEW_PRODUCTS',
    'VIEW_STOCK',
    'ADJUST_STOCK',
    'VIEW_INBOX',
    'REPLY_INBOX',
    // Their seller's customers, without the notes (no create_customers).
    'VIEW_ORDER_CUSTOMERS',
  ],
  permissions: [
    'view_orders',
    'edit_orders',
    'view_products',
    'view_inventory',
    'edit_inventory',
    'view_inbox',
    'reply_inbox',
    'view_customers',
  ],
  scoped: true,
  vendorId: 'vendor_green',
};

export const ACCOUNTS: readonly MockAccount[] = [
  {
    id: 'user_admin',
    email: 'admin@example.com',
    name: 'Amina Rahman',
    role: 'admin',
    isOwner: true,
    password: MOCK_PASSWORD,
    grants: [ADMIN_GRANT],
  },
  {
    id: 'user_two_step',
    email: 'two-step@example.com',
    name: 'Tahmid Hasan',
    role: 'admin',
    isOwner: false,
    password: MOCK_PASSWORD,
    twoFactor: { totpCode: MOCK_TOTP_CODE, backupCodes: ['ABCDE-12345', 'FGHIJ-67890'] },
    grants: [ADMIN_GRANT],
  },
  {
    id: 'user_staff',
    email: 'staff@example.com',
    name: 'Sadia Karim',
    role: 'staff',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [PLATFORM_STAFF_GRANT],
  },
  {
    id: 'user_warehouse',
    email: 'warehouse@example.com',
    name: 'Tania Akter',
    role: 'staff',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [WAREHOUSE_STAFF_GRANT],
  },
  {
    id: 'user_seller',
    email: 'seller@example.com',
    name: 'Nadia Chowdhury',
    role: 'vendor',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [
      {
        workspace: 'vendor',
        role: 'vendor',
        capabilities: SELLER_CAPABILITIES,
        permissions: [
          'view_orders',
          'manage_orders',
          'delete_orders',
          'view_products',
          'manage_products',
          'view_inbox',
          'reply_inbox',
          'manage_inbox',
          'view_payouts',
        ],
        scoped: true,
        vendorId: 'vendor_green',
      },
    ],
  },
  {
    id: 'user_seller_staff',
    email: 'seller-staff@example.com',
    name: 'Rafi Ahmed',
    role: 'staff',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [GREEN_STAFF_GRANT],
  },
  {
    id: 'user_unpaid_seller',
    email: 'unpaid-seller@example.com',
    name: 'Imran Siddiqui',
    role: 'vendor',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [
      {
        workspace: 'vendor',
        role: 'vendor',
        // The unpaid setup window: the catalogue only.
        capabilities: ['VIEW_PRODUCTS', 'EDIT_PRODUCTS', 'VIEW_STOCK', 'ADJUST_STOCK'],
        permissions: ['view_products', 'manage_products'],
        scoped: true,
        vendorId: 'vendor_harbor',
      },
    ],
  },
  {
    id: 'user_both',
    email: 'both@example.com',
    name: 'Farhan Kabir',
    role: 'staff',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [
      {
        ...PLATFORM_STAFF_GRANT,
        capabilities: [...PLATFORM_STAFF_GRANT.capabilities, 'CANCEL_ORDERS', 'REPLY_INBOX'],
        permissions: [...PLATFORM_STAFF_GRANT.permissions, 'delete_orders', 'reply_inbox'],
      },
      GREEN_STAFF_GRANT,
    ],
  },
  {
    id: 'user_no_access',
    email: 'no-access@example.com',
    name: 'Lamia Islam',
    role: 'staff',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [],
  },
  {
    id: 'user_shopper',
    email: 'shopper@example.com',
    name: 'Karim Uddin',
    role: 'customer',
    isOwner: false,
    password: MOCK_PASSWORD,
    grants: [],
  },
];

/** The seller of a vendor workspace, as GET /me describes it. */
export function workspaceVendor(vendorId: string, role: MockGrant['role']): WorkspaceVendor {
  const vendor = VENDORS[vendorId];
  if (!vendor) throw new Error(`No mock vendor ${vendorId}`);
  return {
    id: vendor.id,
    name: vendor.name,
    logo: image(`logo-${vendor.id}`, vendor.name),
    status: vendor.status,
    active: vendor.status === 'approved',
    // A seller's staff work by their own permissions, not the plan's packs.
    packs: role === 'vendor' ? vendor.packs : [],
  };
}

/**
 * The mock store's products and where their stock is. Prices are numbers in
 * the store's currency; the routes make them `Money` in the request's
 * language. Stock is per location: available, committed (sold, not shipped)
 * and unavailable (here, not for sale).
 */
import { daysAgo } from './shared';
import type { ImageSet } from '@/contracts/mobile/biz/v1';

export type MockLocation = { id: string; name: string };

export const LOCATIONS: Record<string, MockLocation> = {
  loc_main: { id: 'loc_main', name: 'Main warehouse' },
  loc_popup: { id: 'loc_popup', name: 'City pop-up' },
  loc_green: { id: 'loc_green', name: 'Green Leaf studio' },
  loc_urban: { id: 'loc_urban', name: 'Urban Thread shop' },
  loc_harbor: { id: 'loc_harbor', name: 'Harbor workshop' },
};

export type MockStock = { available: number; committed: number; unavailable: number };

export type MockVariant = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  price?: number;
  compareAtPrice?: number;
  stock: Record<string, MockStock>;
};

export type MockProduct = {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  status: 'active' | 'draft' | 'unlisted';
  /** The seller who owns it; left out for the store's own. */
  vendorId?: string;
  /** Seeds of its pictures (see `image` in shared.ts). */
  pictures: string[];
  /** Full-editor media already have server URLs. */
  images?: ImageSet[];
  price?: number;
  compareAtPrice?: number;
  priceOnRequest: boolean;
  /** Stock is not counted for it (a digital product). */
  untracked: boolean;
  /** The product's own stock, when it has no variants. */
  stock: Record<string, MockStock>;
  variants: MockVariant[];
  createdAt: string;
  /** Moves with every write; the `version` the app sends back as `If-Match`. */
  updatedAt: number;
  /** Its category (`PRODUCT_CATEGORIES`), brand and hand-picked collections. */
  categoryId?: string;
  brandId?: string;
  collectionIds?: string[];
};

/** The store's categories, as a tree: products sit on the leaves. */
export const PRODUCT_CATEGORIES: { id: string; name: string; parentId?: string }[] = [
  { id: 'cat_home', name: 'Home & living' },
  { id: 'cat_kitchen', name: 'Kitchen', parentId: 'cat_home' },
  { id: 'cat_decor', name: 'Decor', parentId: 'cat_home' },
  { id: 'cat_vases', name: 'Vases', parentId: 'cat_decor' },
  { id: 'cat_candles', name: 'Candles', parentId: 'cat_decor' },
  { id: 'cat_garden', name: 'Garden' },
  { id: 'cat_clothing', name: 'Clothing' },
  { id: 'cat_tops', name: 'Tops', parentId: 'cat_clothing' },
  { id: 'cat_outerwear', name: 'Outerwear', parentId: 'cat_clothing' },
  { id: 'cat_bags', name: 'Bags', parentId: 'cat_clothing' },
  { id: 'cat_stationery', name: 'Stationery' },
  { id: 'cat_paper', name: 'Paper goods', parentId: 'cat_stationery' },
  { id: 'cat_writing', name: 'Writing', parentId: 'cat_stationery' },
  { id: 'cat_downloads', name: 'Downloads' },
  // No product of the mock store sits here: GET /products/filters leaves it out.
  { id: 'cat_toys', name: 'Toys' },
];

export const PRODUCT_BRANDS = [
  { id: 'brand_studio', name: 'Studio' },
  { id: 'brand_green', name: 'Green Leaf' },
  { id: 'brand_urban', name: 'Urban Thread' },
  { id: 'brand_harbor', name: 'Harbor & Co' },
];

/**
 * The store's collections: hand-picked (`collectionIds` on the product) or,
 * with `under`, every product priced below it (a rule).
 */
export const PRODUCT_COLLECTIONS: { id: string; name: string; under?: number }[] = [
  { id: 'col_new', name: 'New arrivals' },
  { id: 'col_gifts', name: 'Gifts under $20', under: 20 },
  { id: 'col_best', name: 'Bestsellers' },
  { id: 'col_archive', name: 'Archive' },
];

/** Where each product sits. The stationery are filed by `stationery()`. */
const FILED: Record<string, Pick<MockProduct, 'categoryId' | 'brandId' | 'collectionIds'>> = {
  prod_vase: {
    categoryId: 'cat_vases',
    brandId: 'brand_studio',
    collectionIds: ['col_new', 'col_best'],
  },
  prod_towel: { categoryId: 'cat_kitchen', brandId: 'brand_green', collectionIds: ['col_new'] },
  prod_mug: { categoryId: 'cat_kitchen', brandId: 'brand_green', collectionIds: ['col_best'] },
  prod_candle: { categoryId: 'cat_candles', brandId: 'brand_green' },
  prod_planter: { categoryId: 'cat_garden', brandId: 'brand_green' },
  prod_tee: { categoryId: 'cat_tops', brandId: 'brand_urban', collectionIds: ['col_best'] },
  prod_jacket: { categoryId: 'cat_outerwear', brandId: 'brand_urban' },
  prod_guide: { categoryId: 'cat_downloads', brandId: 'brand_studio' },
  prod_tote: { categoryId: 'cat_bags', brandId: 'brand_studio' },
  prod_basket: { categoryId: 'cat_decor', brandId: 'brand_harbor' },
};

const units = (available: number, committed = 0, unavailable = 0): MockStock => ({
  available,
  committed,
  unavailable,
});

/** A fresh copy of the products, newest first. */
export function seedProducts(): MockProduct[] {
  const base = Date.now() - 60 * 60 * 1000;
  const products: MockProduct[] = [
    {
      id: 'prod_vase',
      name: 'Ceramic bud vase',
      sku: 'VASE-01',
      barcode: '4006381333931',
      status: 'active',
      pictures: ['vase'],
      price: 24,
      priceOnRequest: false,
      untracked: false,
      stock: { loc_main: units(18, 2, 1), loc_popup: units(6, 1) },
      variants: [],
      createdAt: daysAgo(1),
      updatedAt: base + 1,
    },
    {
      id: 'prod_towel',
      name: 'Linen tea towel (set of 2)',
      sku: 'TOWEL-LIN-2',
      barcode: '036000291452',
      status: 'active',
      vendorId: 'vendor_green',
      pictures: ['towel', 'towel-2'],
      price: 18,
      compareAtPrice: 22,
      priceOnRequest: false,
      untracked: false,
      stock: { loc_green: units(3, 1) },
      variants: [],
      createdAt: daysAgo(2),
      updatedAt: base + 2,
    },
    {
      id: 'prod_mug',
      name: 'Stoneware mug',
      sku: 'MUG',
      status: 'active',
      vendorId: 'vendor_green',
      pictures: ['mug'],
      priceOnRequest: false,
      untracked: false,
      stock: {},
      variants: [
        {
          id: 'var_mug_sage',
          name: 'Sage',
          sku: 'MUG-SAGE',
          barcode: '5901234123457',
          price: 16,
          stock: { loc_green: units(12, 2) },
        },
        {
          id: 'var_mug_sand',
          name: 'Sand',
          sku: 'MUG-SAND',
          barcode: '5901234123464',
          price: 16,
          stock: { loc_green: units(0, 1) },
        },
        {
          id: 'var_mug_charcoal',
          name: 'Charcoal',
          sku: 'MUG-CHAR',
          price: 18,
          compareAtPrice: 20,
          stock: { loc_green: units(7, 0, 1) },
        },
      ],
      createdAt: daysAgo(3),
      updatedAt: base + 3,
    },
    {
      id: 'prod_candle',
      name: 'Beeswax pillar candle',
      sku: 'CANDLE-PILLAR',
      status: 'active',
      vendorId: 'vendor_green',
      pictures: ['candle'],
      price: 12.5,
      priceOnRequest: false,
      untracked: false,
      stock: { loc_green: units(40, 4) },
      variants: [],
      createdAt: daysAgo(5),
      updatedAt: base + 4,
    },
    {
      id: 'prod_planter',
      name: 'Hanging planter',
      sku: 'PLANTER-HANG',
      status: 'draft',
      vendorId: 'vendor_green',
      pictures: ['planter'],
      price: 29,
      priceOnRequest: false,
      untracked: false,
      stock: { loc_green: units(5) },
      variants: [],
      createdAt: daysAgo(6),
      updatedAt: base + 5,
    },
    {
      id: 'prod_tee',
      name: 'Organic cotton tee',
      sku: 'TEE-ORG',
      status: 'active',
      vendorId: 'vendor_urban',
      pictures: ['tee'],
      priceOnRequest: false,
      untracked: false,
      stock: {},
      variants: [
        { id: 'var_tee_s', name: 'S', sku: 'TEE-ORG-S', price: 25, stock: { loc_urban: units(9) } },
        {
          id: 'var_tee_m',
          name: 'M',
          sku: 'TEE-ORG-M',
          price: 25,
          stock: { loc_urban: units(4, 3) },
        },
        { id: 'var_tee_l', name: 'L', sku: 'TEE-ORG-L', price: 27, stock: { loc_urban: units(2) } },
      ],
      createdAt: daysAgo(8),
      updatedAt: base + 6,
    },
    {
      id: 'prod_jacket',
      name: 'Waxed field jacket',
      sku: 'JACKET-WAX',
      status: 'active',
      vendorId: 'vendor_urban',
      pictures: ['jacket'],
      priceOnRequest: true,
      untracked: false,
      stock: { loc_urban: units(3) },
      variants: [],
      createdAt: daysAgo(10),
      updatedAt: base + 7,
    },
    {
      id: 'prod_guide',
      name: 'Natural dyeing guide (PDF)',
      sku: 'GUIDE-DYE',
      status: 'active',
      pictures: ['guide'],
      price: 9,
      priceOnRequest: false,
      untracked: true,
      stock: {},
      variants: [],
      createdAt: daysAgo(12),
      updatedAt: base + 8,
    },
    {
      id: 'prod_tote',
      name: 'Canvas tote bag',
      sku: 'TOTE-CNV-01',
      barcode: 'TOTE-CNV-01',
      status: 'unlisted',
      pictures: ['tote'],
      price: 14,
      priceOnRequest: false,
      untracked: false,
      stock: { loc_main: units(60, 5) },
      variants: [],
      createdAt: daysAgo(15),
      updatedAt: base + 9,
    },
    {
      id: 'prod_basket',
      name: 'Seagrass basket',
      sku: 'BASKET-SEA',
      status: 'draft',
      vendorId: 'vendor_harbor',
      pictures: ['basket'],
      price: 32,
      priceOnRequest: false,
      untracked: false,
      stock: { loc_harbor: units(6) },
      variants: [],
      createdAt: daysAgo(20),
      updatedAt: base + 10,
    },
  ];
  return [
    ...products.map((product) => ({ ...product, ...FILED[product.id] })),
    ...stationery(base),
  ];
}

/**
 * The store's older lines, all well stocked: enough products for the list's
 * second page.
 */
const STATIONERY = [
  'Recycled notebook A5',
  'Dot grid journal',
  'Brass pencil sharpener',
  'Cedar pencils (set of 6)',
  'Linen-bound sketchbook',
  'Kraft envelopes (pack of 20)',
  'Wax seal kit',
  'Fountain pen ink, indigo',
  'Walnut desk tray',
  'Brass paper clips',
  'Washi tape trio',
  'Weekly planner pad',
  'Letterpress greeting card',
  'Bookbinding thread',
  'Bamboo ruler, 30 cm',
  'Cotton string tags',
  'Pocket memo book',
  'Graphite stick set',
];

function stationery(base: number): MockProduct[] {
  return STATIONERY.map((name, index) => {
    const number = String(index + 1).padStart(2, '0');
    return {
      id: `prod_stn_${number}`,
      name,
      sku: `STN-${number}`,
      status: 'active',
      pictures: [`stationery-${number}`],
      price: 6 + ((index * 3) % 15),
      priceOnRequest: false,
      untracked: false,
      stock: { loc_main: units(25 + ((index * 7) % 40), index % 3) },
      variants: [],
      createdAt: daysAgo(25 + index * 2),
      updatedAt: base + 11 + index,
      categoryId: index % 2 === 0 ? 'cat_paper' : 'cat_writing',
    };
  });
}

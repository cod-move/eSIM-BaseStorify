/**
 * The mock store's data for: vendors. Two are the sellers named on the product
 * seeds; the rest only fill the list past one page, as a large marketplace's would.
 */
import type { VendorDetail } from '@/contracts/mobile/shop/v1';

import { SEEDS } from './products';
import { picture } from './shared';

type VendorSeed = Omit<VendorDetail, 'id' | 'logo' | 'banner' | 'productCount'>;

const VENDORS: VendorSeed[] = [
  {
    slug: 'north-trail',
    name: 'North Trail',
    verified: true,
    rating: { average: 4.6, count: 388 },
    description: 'Bags and outdoor gear made to be carried for years.',
    location: 'Portland, OR',
    unitsSold: 12840,
    memberSince: '2021-04-12T00:00:00.000Z',
  },
  {
    slug: 'kiln-co',
    name: 'Kiln & Co',
    verified: false,
    description: 'Stoneware for the kitchen and the table, thrown by hand.',
    unitsSold: 2310,
  },
  ...Array.from({ length: 45 }, (_, index): VendorSeed => {
    const number = String(index + 1).padStart(2, '0');
    return {
      slug: `shop-${number}`,
      name: `Shop ${number}`,
      verified: index % 3 === 0,
      description: 'A small shop with a few things made well.',
      unitsSold: 100 + index,
    };
  }),
];

function detail(seed: VendorSeed): VendorDetail {
  return {
    ...seed,
    id: `vendor-${seed.slug}`,
    logo: picture(`${seed.slug}-logo`, seed.name),
    banner: picture(`${seed.slug}-banner`, seed.name, 3),
    productCount: SEEDS.filter((product) => product.vendor === seed.name).length,
  };
}

export function listVendors(): VendorDetail[] {
  return VENDORS.map(detail);
}

export function findVendor(slug: string): VendorDetail | undefined {
  const seed = VENDORS.find((vendor) => vendor.slug === slug);
  return seed ? detail(seed) : undefined;
}

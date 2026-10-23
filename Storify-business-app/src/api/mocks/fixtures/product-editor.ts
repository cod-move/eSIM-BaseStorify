import { PRODUCT_EDITOR_FIELDS, type ProductFormOptions } from '@/contracts/mobile/biz/v1';

import { MOCK_UPLOAD_POLICIES } from './uploads';

export const PRODUCT_EDITOR_OPTIONS: ProductFormOptions = {
  currency: 'USD',
  formats: ['physical', 'digital'],
  descriptionFormat: 'html',
  features: { physical: true, digital: true, preorders: true, priceOnRequest: true },
  writableFields: [...PRODUCT_EDITOR_FIELDS],
  actions: ['set_active', 'set_draft', 'set_unlisted', 'delete'],
  categories: [
    { id: 'category_home', name: 'Home', path: ['Home'], isLeaf: true },
    {
      id: 'category_clothing',
      name: 'Clothing',
      path: ['Clothing'],
      isLeaf: true,
      options: [
        { name: 'Size', values: [{ value: 'Small' }, { value: 'Medium' }, { value: 'Large' }] },
      ],
    },
    { id: 'category_digital', name: 'Downloads', path: ['Downloads'], isLeaf: true },
  ],
  brands: [{ id: 'brand_studio', name: 'Studio' }],
  collections: [
    { id: 'collection_new', title: 'New arrivals' },
    { id: 'collection_best', title: 'Bestsellers' },
  ],
  locations: [],
  shipping: { enabled: true, weightUnit: 'kg', usesWeightRates: true, customsEnabled: true },
  preorder: {
    allowed: true,
    deferredBalanceSupported: true,
    maxLeadDays: 365,
    maxDepositPercent: 100,
  },
  limits: { media: 250, variants: 250, digitalAssets: 20 },
  uploads: [
    MOCK_UPLOAD_POLICIES.product_media,
    MOCK_UPLOAD_POLICIES.digital_asset,
    MOCK_UPLOAD_POLICIES.digital_preview,
  ],
};

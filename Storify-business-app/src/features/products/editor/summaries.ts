import { useTranslations } from 'use-intl';

import type { ProductEditorFields, ProductFormOptions } from '@/contracts/mobile/biz/v1';

export const EDITOR_SECTIONS = [
  'details',
  'media',
  'variants',
  'pricing',
  'inventory',
  'shipping',
  'availability',
  'preorder',
  'seo',
] as const;
export type EditorSectionKey = (typeof EDITOR_SECTIONS)[number];

/** Where each field of the contract is edited, so a refused field opens its section. */
const FIELD_SECTIONS: Record<keyof ProductEditorFields, EditorSectionKey> = {
  name: 'details',
  title: 'details',
  description: 'details',
  shortDescription: 'details',
  category: 'details',
  brand: 'details',
  productType: 'details',
  collectionIds: 'details',
  tags: 'details',
  attributes: 'details',
  images: 'media',
  media: 'media',
  digitalAssets: 'media',
  digitalDelivery: 'media',
  digitalPreview: 'media',
  options: 'variants',
  variants: 'variants',
  price: 'pricing',
  comparePrice: 'pricing',
  cost: 'pricing',
  unitPrice: 'pricing',
  unitPriceUnit: 'pricing',
  chargeTax: 'pricing',
  priceOnRequest: 'pricing',
  quoteButtonLabel: 'pricing',
  sku: 'inventory',
  barcode: 'inventory',
  barcodeFormat: 'inventory',
  barcodeSource: 'inventory',
  stock: 'inventory',
  inventory: 'inventory',
  locationInventory: 'inventory',
  shipping: 'shipping',
  status: 'availability',
  publishing: 'availability',
  featured: 'availability',
  returns: 'availability',
  preorder: 'preorder',
  seo: 'seo',
};

export function fieldSection(field: string): EditorSectionKey | undefined {
  return FIELD_SECTIONS[field as keyof ProductEditorFields];
}

/** A description's words, for a search preview: no tags, entities read. */
export function plainText(html: string): string {
  return html
    .replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp|#39);/g,
      (entity) =>
        ({
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&apos;': "'",
          '&#39;': "'",
          '&nbsp;': ' ',
        })[entity] ?? entity
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * What a folded section holds, on the line under its title: the operator reads
 * the whole product without opening anything. Numbers are the operator's own,
 * as typed; the store's displays come after saving.
 */
export function useSectionSummaries(
  values: ProductEditorFields,
  options: ProductFormOptions,
  isNew: boolean
): Record<EditorSectionKey, string> {
  const t = useTranslations('products.editor.summary');
  const units = useTranslations('products.editor.units');
  const statuses = useTranslations('products.editor.statuses');
  const join = (parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' · ');
  const category = options.categories.find((item) => item.id === values.category);
  const media = values.media?.length ?? 0;
  const files = values.digitalAssets?.length ?? 0;
  const optionCount = values.options?.length ?? 0;
  const variantCount = values.variants?.length ?? 0;
  const shipping = values.shipping;
  const inventory = values.inventory ?? { tracked: true, continueSellingWhenOutOfStock: false };
  const publishing = values.publishing;
  return {
    details: join([values.name || t('noName'), category?.name ?? t('noCategory')]),
    media: join([
      media ? t('media', { count: media }) : t('noMedia'),
      shipping?.isPhysicalProduct === false && t('files', { count: files }),
    ]),
    variants: optionCount
      ? join([t('options', { count: optionCount }), t('variants', { count: variantCount })])
      : t('noOptions'),
    pricing: values.priceOnRequest
      ? t('priceOnRequest')
      : !values.price && isNew
        ? t('noPrice')
        : join([
            t('price', { price: String(values.price ?? 0), currency: options.currency }),
            values.comparePrice != null && t('compareAt'),
            values.chargeTax && t('taxed'),
          ]),
    inventory: join([
      values.sku && t('sku', { sku: values.sku }),
      inventory.tracked ? t('tracked') : t('untracked'),
      isNew && !variantCount && values.stock !== undefined && t('stock', { count: values.stock }),
    ]),
    shipping:
      shipping?.isPhysicalProduct === false
        ? t('digital')
        : join([
            t('physical'),
            shipping?.weight !== undefined &&
              t('weight', {
                weight: String(shipping.weight),
                unit: units(shipping.weightUnit ?? options.shipping.weightUnit),
              }),
          ]),
    availability: join([
      values.status ? statuses(values.status) : t('storeDefault'),
      publishing?.onlineStore && t('onlineStore'),
      values.returns?.finalSale && t('finalSale'),
    ]),
    preorder: values.preorder?.enabled ? t('preorderOn') : t('preorderOff'),
    seo: values.seo?.pageTitle || values.seo?.handle ? t('seoCustom') : t('seoAuto'),
  };
}

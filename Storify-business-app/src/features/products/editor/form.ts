import type {
  ProductEditorDetail,
  ProductEditorFields,
  ProductFormOptions,
  ProductSaveRequest,
} from '@/contracts/mobile/biz/v1';

import { editorFingerprint } from '../product-editor-conflict';

export function newProductValues(options: ProductFormOptions): ProductEditorFields {
  return {
    name: '',
    description: '',
    price: 0,
    category: '',
    ...(options.writableFields.includes('shipping')
      ? { shipping: { isPhysicalProduct: options.formats[0] !== 'digital' } }
      : {}),
  };
}

/** Never send stale inventory back with unrelated variant metadata. */
export function fullProductChanges(
  base: ProductEditorDetail,
  values: ProductEditorFields,
  writable: readonly (keyof ProductEditorFields)[]
): ProductSaveRequest {
  const changes = Object.fromEntries(
    writable
      .filter(
        (key) =>
          values[key] !== undefined &&
          editorFingerprint(values[key]) !== editorFingerprint(base.values[key])
      )
      .map((key) => [key, values[key]])
  ) as ProductSaveRequest['changes'];
  delete changes.stock;
  delete changes.locationInventory;
  const existing = new Map(
    base.values.variants?.filter((variant) => variant.id).map((variant) => [variant.id!, variant])
  );
  if (changes.variants) {
    changes.variants = changes.variants.map((variant) => {
      if (!variant.id || !existing.has(variant.id)) return variant;
      const { stock: _stock, locationInventory: _locationInventory, ...fields } = variant;
      return fields;
    });
    return {
      changes,
      stockBaseline: {
        variants: Object.fromEntries(
          [...existing].map(([id, variant]) => [
            id,
            {
              stock: variant.stock,
              locationInventory: Object.fromEntries(
                (variant.locationInventory ?? []).map((row) => [row.locationId, row.quantity])
              ),
            },
          ])
        ),
      },
    };
  }
  return { changes };
}

export function createProductValues(
  values: ProductEditorFields,
  writable: readonly (keyof ProductEditorFields)[]
) {
  const allowed = Object.fromEntries(
    writable.filter((key) => values[key] !== undefined).map((key) => [key, values[key]])
  ) as ProductEditorFields;
  if (allowed.shipping?.isPhysicalProduct !== false) {
    delete allowed.digitalAssets;
    delete allowed.digitalDelivery;
    delete allowed.digitalPreview;
  }
  return allowed;
}

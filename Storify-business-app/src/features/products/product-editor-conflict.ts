import type {
  ProductEditorDetail,
  ProductEditorFields,
  ProductSaveRequest,
} from '@/contracts/mobile/biz/v1';

export function editorFingerprint(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Stock baseline fields round-trip counters; they do not ask the editor to change existing units. */
function comparable(value: unknown, field: string, request: ProductSaveRequest): unknown {
  if (field !== 'variants' || !Array.isArray(value)) return value;
  return value.map((variant: unknown) => {
    if (
      !isRecord(variant) ||
      typeof variant.id !== 'string' ||
      !request.stockBaseline?.variants?.[variant.id]
    )
      return variant;
    const { stock: _stock, locationInventory: _locations, ...editable } = variant;
    return editable;
  });
}

function leaves(value: unknown, path: string[]): { path: string[]; value: unknown }[] {
  if (!isRecord(value)) return [{ path, value }];
  return Object.entries(value).flatMap(([key, item]) =>
    item === undefined ? [] : leaves(item, [...path, key])
  );
}

function at(value: unknown, path: string[]): unknown {
  for (const key of path) value = isRecord(value) ? value[key] : undefined;
  return value;
}

export function checkProductEditorChange(
  request: ProductSaveRequest,
  base: ProductEditorDetail,
  current: ProductEditorDetail
) {
  const touched = Object.entries(request.changes).flatMap(([field, value]) => {
    if (
      value === undefined ||
      (request.stockBaseline && ['stock', 'locationInventory'].includes(field))
    )
      return [];
    return leaves(comparable(value, field, request), [field]);
  });
  const read = (detail: ProductEditorDetail, path: string[]) =>
    at(
      { ...detail.values, variants: comparable(detail.values.variants, 'variants', request) },
      path
    );
  const equal = (a: unknown, b: unknown) => editorFingerprint(a) === editorFingerprint(b);
  if (touched.every(({ path, value }) => equal(read(current, path), value)))
    return { state: 'applied' as const, fields: [] };
  const fields = touched
    .filter(
      ({ path, value }) =>
        !equal(read(current, path), read(base, path)) && !equal(read(current, path), value)
    )
    .map(({ path }) => path.join('.'));
  return { state: fields.length ? ('conflict' as const) : ('unchanged' as const), fields };
}

/** `record` with `value` at `path`, nothing else changed; `undefined` takes the field away. */
function put(record: Record<string, unknown>, path: string[], value: unknown) {
  const [key, ...rest] = path;
  if (key === undefined) return record;
  const next = { ...record };
  if (rest.length) {
    const inner = next[key];
    next[key] = put(isRecord(inner) ? inner : {}, rest, value);
  } else if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/**
 * The draft after a conflict: the operator's edits on top of the product as it
 * now is, with the store's own value in each field both changed (`fields`).
 */
export function storeValuesInConflict(conflict: ProductEditorConflict): ProductEditorFields {
  let values: Record<string, unknown> = {
    ...conflict.current.values,
    ...conflict.request.changes,
  };
  for (const field of conflict.fields) {
    const path = field.split('.');
    values = put(values, path, at(conflict.current.values, path));
  }
  return values as ProductEditorFields;
}

export class ProductEditorConflict extends Error {
  constructor(
    readonly current: ProductEditorDetail,
    readonly fields: string[],
    readonly request: ProductSaveRequest
  ) {
    super('This product changed in the fields being saved');
    this.name = 'ProductEditorConflict';
  }
}

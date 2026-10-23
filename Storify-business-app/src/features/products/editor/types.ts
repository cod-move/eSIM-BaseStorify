import type { ProductEditorFields, ProductFormOptions } from '@/contracts/mobile/biz/v1';

/** Local form props; API values retain the canonical contract. */
export type ProductEditorSectionProps = {
  values: ProductEditorFields;
  /** The values as the store last saved them; none for a new product. */
  saved?: ProductEditorFields;
  options: ProductFormOptions;
  writableFields: readonly (keyof ProductEditorFields)[];
  onChange: (changes: Partial<ProductEditorFields>) => void;
  draftId: string;
  productId: string | null;
  disabled: boolean;
  isNew: boolean;
  /** Fields the last check refused (`name`, `price`), marked where they are. */
  issues: ReadonlySet<string>;
  onPendingUploadChange?: (pending: boolean) => void;
};

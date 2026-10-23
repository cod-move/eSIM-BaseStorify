import type { ProductEditorDetail, ProductEditorFields } from '@/contracts/mobile/biz/v1';

export type ProductDraft = {
  workspace: string;
  draftId: string;
  values: ProductEditorFields;
  base?: ProductEditorDetail;
  operation?: {
    key: string;
    kind: 'create' | 'save' | 'action';
    action?: 'set_active' | 'set_draft' | 'set_unlisted' | 'delete';
  };
};
const drafts = new Map<string, ProductDraft>();
export const productDraftKey = (actor: string, workspace: string, id: string | null) =>
  JSON.stringify([actor, workspace, id]);
export const getProductDraft = (key: string) => drafts.get(key);
export const setProductDraft = (key: string, draft: ProductDraft) => drafts.set(key, draft);
export const removeProductDraft = (key: string) => drafts.delete(key);
export const clearProductDrafts = () => drafts.clear();
export function retainProductDrafts(
  workspace: string | null,
  canEdit: boolean,
  canCreate: boolean
) {
  for (const [key, draft] of drafts) {
    const id = (JSON.parse(key) as [string, string, string | null])[2];
    if (draft.workspace !== workspace || !(id ? canEdit : canCreate)) drafts.delete(key);
  }
}

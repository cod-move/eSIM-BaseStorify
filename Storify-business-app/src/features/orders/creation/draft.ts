import type {
  ManualOrderDraftRequest,
  ManualOrderAddressRequest,
  ManualOrderQuote,
  ManualOrderCreateRequest,
  OrderContactCreateRequest,
  OrderCustomerSelector,
  OrderProductSelector,
  Workspace,
} from '@/contracts/mobile/biz/v1';

export const creationFingerprint = (value: unknown) =>
  JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
export const creationDraftKey = (actor: string, workspace: Workspace) =>
  JSON.stringify([actor, workspace]);
export type CreationDraft = {
  workspace: Workspace;
  form: Omit<Partial<ManualOrderDraftRequest>, 'shippingAddress' | 'billingAddress'> & {
    draftId: string;
    items: ManualOrderDraftRequest['items'];
    shippingAddress?: Partial<ManualOrderAddressRequest>;
    billingAddress?: Partial<ManualOrderAddressRequest>;
  };
  products: OrderProductSelector[];
  selectedCustomer?: OrderCustomerSelector;
  customerMode: 'existing' | 'guest' | 'create_contact';
  contact: OrderContactCreateRequest;
  /** The quoted order is on show for a last look before it is created. */
  reviewing: boolean;
  quote?: ManualOrderQuote;
  /**
   * Until when the quote may be used, by this phone's clock: when it was asked
   * for plus the store's quote lifetime. The quote's own `expiresAt` is the
   * store's clock, which the phone's may be minutes away from; the store's
   * `QUOTE_EXPIRED` has the last word.
   */
  quoteValidUntil?: number;
  quotedFingerprint?: string;
  recordPayment: boolean;
  paymentReference: string;
  billingSeparate: boolean;
  operation?:
    | { kind: 'order'; key: string; request: ManualOrderCreateRequest }
    | { kind: 'contact'; key: string; request: OrderContactCreateRequest };
};
const drafts = new Map<string, CreationDraft>();
export const getCreationDraft = (key: string) => drafts.get(key);
export const setCreationDraft = (key: string, draft: CreationDraft) => drafts.set(key, draft);
export const removeCreationDraft = (key: string) => drafts.delete(key);
export const clearCreationDrafts = () => drafts.clear();
export function retainCreationDrafts(workspace: Workspace | null, allowed: boolean) {
  for (const [key, draft] of drafts)
    if (!allowed || draft.workspace !== workspace) drafts.delete(key);
}

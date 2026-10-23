import type { ReturnPreviewRequest } from '@/contracts/mobile/shop/v1';

export const returnsKeys = {
  /** The shopper's returns, newest first. */
  returnList: (locale: string) => ['private', locale, 'returns', 'list'] as const,
  returnDetail: (locale: string, id: string) =>
    ['private', locale, 'returns', 'detail', id] as const,
  returnOptions: (locale: string, orderId: string) =>
    ['private', locale, 'returns', 'options', orderId] as const,
  /** One preview per selection: a new selection asks the store again. */
  returnPreview: (locale: string, orderId: string, selection: ReturnPreviewRequest | null) =>
    ['private', locale, 'returns', 'preview', orderId, selection] as const,
};

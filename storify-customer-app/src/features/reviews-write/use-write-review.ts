import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';

import { createReview } from '@/api/endpoints/reviews-write';
import { uploadPhoto } from '@/api/endpoints/uploads';
import { queryKeys } from '@/api/query-keys';
import { useLocale } from '@/i18n/locale-store';

import { requestOf, type ReviewDraft } from './review-draft';

/**
 * Sends the shopper's review of a product: its photos first, one by one and
 * in order, then the review naming their upload ids.
 *
 * The review is sent once. Its `Idempotency-Key` is made when the sheet opens
 * and goes with every retry, so a retry after a lost answer gets the review
 * already written. A photo that was uploaded is not uploaded again on a
 * retry: its id is kept. A second tap while the first is on its way does
 * nothing.
 */
export function useWriteReview(product: { id: string; slug: string }) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [idempotencyKey] = useState(randomUUID);
  /** Picked photo's address → its upload id. */
  const uploaded = useRef(new Map<string, string>());
  const sending = useRef(false);

  const mutation = useMutation({
    mutationFn: async (draft: ReviewDraft) => {
      const uploadIds: string[] = [];
      for (const photo of draft.photos) {
        if (photo.kind === 'kept') {
          uploadIds.push(photo.photo.id);
          continue;
        }
        let id = uploaded.current.get(photo.file.uri);
        if (id === undefined) {
          id = (await uploadPhoto(locale, photo.file)).id;
          uploaded.current.set(photo.file.uri, id);
        }
        uploadIds.push(id);
      }
      return createReview(locale, product.id, requestOf(draft, uploadIds), idempotencyKey);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.meProduct(locale, product.id) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.allProductReviews(locale, product.slug),
      });
      // My reviews: the new one joins the rated, and leaves the waiting.
      void queryClient.invalidateQueries({ queryKey: queryKeys.allMyReviews(locale) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviewsWaiting(locale) });
    },
  });

  const submit = (draft: ReviewDraft) => {
    if (sending.current) return;
    sending.current = true;
    mutation.mutate(draft, {
      onSettled: () => {
        sending.current = false;
      },
    });
  };

  return { submit, review: mutation.data, error: mutation.error, isPending: mutation.isPending };
}

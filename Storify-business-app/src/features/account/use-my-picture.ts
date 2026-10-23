import { useMutation, useQueryClient } from '@tanstack/react-query';

import { removeMyPicture, updateMyPicture } from '@/api/endpoints/me';
import { showAnswer } from '@/api/query-client';
import { ME_QUERIES, queryKeys } from '@/api/query-keys';
import type { SelectedUploadFile } from '@/features/uploads/selected-file';
import { useLocale } from '@/i18n/locale-store';

/** A new picture from a photo the operator picked, or none. */
export type PictureChange = { photo: SelectedUploadFile } | { remove: true };

/**
 * Changes the operator's own profile picture (PUT and DELETE /me/picture). The
 * store answers the whole GET /me, which becomes the cached one at once: the
 * account screen and the Account tab show the new picture with nothing read
 * again. Not keyed: sending the same photo twice sets the same picture. Offline
 * it fails at once, as every change does (`query-client.ts`).
 */
export function useMyPicture() {
  const locale = useLocale();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (change: PictureChange) =>
      'remove' in change
        ? removeMyPicture(locale)
        : updateMyPicture(locale, change.photo.blob, change.photo.filename),
    onSuccess: async (me) => {
      await showAnswer(queryClient, queryKeys.me(locale), me);
      // GET /me kept in another language holds the old picture: read it when used.
      await queryClient.invalidateQueries({ queryKey: ME_QUERIES, refetchType: 'none' });
    },
  });
}

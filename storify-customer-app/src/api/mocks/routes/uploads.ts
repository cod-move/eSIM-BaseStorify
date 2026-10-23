/**
 * Uploads. The mock store does not look at the file: it takes every photo it
 * is sent, and the size and type refusals come from the real store alone.
 */
import type { Upload } from '@/contracts/mobile/shop/v1';

import { picture } from '../fixtures/shared';
import { requireUser, type MockRoute } from '../kit';
import { state } from '../state';

/** Upload id → the photo and whose it is. */
const uploads = new Map<string, { owner: string; upload: Upload }>();

/** The shopper's upload with this id, or nothing when it is not theirs. */
export function uploadOf(userId: string, id: string): Upload | undefined {
  const found = uploads.get(id);
  return found?.owner === userId ? found.upload : undefined;
}

export const routes: MockRoute[] = [
  {
    method: 'POST',
    path: '/uploads',
    handle: (ctx) => {
      const user = requireUser(ctx);
      const id = `upl-${state.nextId++}`;
      const upload: Upload = {
        id,
        image: picture(id, ''),
        mimeType: 'image/jpeg',
        size: 0,
      };
      uploads.set(id, { owner: user.id, upload });
      return upload;
    },
  },
];

export function reset(): void {
  uploads.clear();
}

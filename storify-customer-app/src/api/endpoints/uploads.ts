/** Endpoints: uploads. */
import { Upload } from '@/contracts/mobile/shop/v1';

import { sendFile } from '../api';
import type { FormFile } from '../transport';

/** Sends one photo; its `id` names it afterwards (a review's `uploadIds`). */
export function uploadPhoto(locale: string, file: FormFile, signal?: AbortSignal) {
  return sendFile({ locale, path: '/uploads', field: 'file', file, signal }, Upload);
}

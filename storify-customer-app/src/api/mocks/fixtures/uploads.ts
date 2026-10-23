/** The mock store's data for: uploads. */
import {
  UPLOAD_ALLOWED_TYPES,
  UPLOAD_MAX_BYTES,
  type UploadPolicy,
} from '@/contracts/mobile/shop/v1';

/** The mock store sets no smaller image limit than the app's own. */
export const UPLOAD_POLICY: UploadPolicy = {
  maxBytes: UPLOAD_MAX_BYTES,
  allowedTypes: [...UPLOAD_ALLOWED_TYPES],
};

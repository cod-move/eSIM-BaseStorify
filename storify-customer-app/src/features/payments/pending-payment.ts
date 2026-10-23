import { Platform } from 'react-native';

import { secureStorage } from '@/lib/secure-storage';
import { storage } from '@/lib/storage';
import { SECURE_KEYS } from '@/lib/storage-keys';

const KEY = SECURE_KEYS.pendingPayment;
/** Where v1 of the app kept the record, in plain storage. */
const V1_KEY = 'storify.pending-payment';

/**
 * A record v1 left in plain storage is moved into secure storage and deleted,
 * so the move happens once. A record already in secure storage is newer and
 * wins. In a browser the secure storage is the plain one: nothing to move.
 */
function moveV1Record() {
  if (Platform.OS === 'web') return;
  const v1 = storage.get(V1_KEY);
  if (v1 === null) return;
  if (secureStorage.getItem(KEY) === null) secureStorage.setItem(KEY, v1);
  storage.remove(V1_KEY);
}

/**
 * The card payment that has been started and has no final outcome yet.
 *
 * It is kept on the device, so that a shopper who closed the app after paying,
 * or while the bank was still thinking, is told how the payment ended before
 * anything else is shown, and is never asked to pay twice.
 */
export const pendingPayment = {
  read: (): string | null => {
    moveV1Record();
    return secureStorage.getItem(KEY);
  },
  write: (paymentIntentId: string): void => {
    moveV1Record();
    secureStorage.setItem(KEY, paymentIntentId);
  },
  clear: (): void => {
    moveV1Record();
    secureStorage.removeItem(KEY);
  },
};

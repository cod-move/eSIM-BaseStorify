import { pendingPayment } from '@/features/payments/pending-payment';
import { secureStorage } from '@/lib/secure-storage';
import { storage } from '@/lib/storage';
import { SECURE_KEYS } from '@/lib/storage-keys';

/** Where v1 of the app left the record. */
const V1_KEY = 'storify.pending-payment';

afterEach(() => {
  storage.remove(V1_KEY);
  secureStorage.removeItem(SECURE_KEYS.pendingPayment);
});

describe('the pending card payment', () => {
  it('is kept in secure storage', () => {
    pendingPayment.write('pi_123');

    expect(secureStorage.getItem(SECURE_KEYS.pendingPayment)).toBe('pi_123');
    expect(storage.get(V1_KEY)).toBeNull();
    expect(pendingPayment.read()).toBe('pi_123');

    pendingPayment.clear();
    expect(pendingPayment.read()).toBeNull();
  });

  it('moves a record v1 left in plain storage, once, and deletes it', () => {
    storage.set(V1_KEY, 'pi_v1');

    expect(pendingPayment.read()).toBe('pi_v1');
    expect(secureStorage.getItem(SECURE_KEYS.pendingPayment)).toBe('pi_v1');
    expect(storage.get(V1_KEY)).toBeNull();

    // Cleared once the outcome is known, it does not come back from plain storage.
    pendingPayment.clear();
    expect(pendingPayment.read()).toBeNull();
  });

  it('keeps the newer record in secure storage over a v1 one', () => {
    secureStorage.setItem(SECURE_KEYS.pendingPayment, 'pi_new');
    storage.set(V1_KEY, 'pi_v1');

    expect(pendingPayment.read()).toBe('pi_new');
    expect(storage.get(V1_KEY)).toBeNull();
  });
});

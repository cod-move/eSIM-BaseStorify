import { redirectSystemPath } from '@/app/+native-intent';

import { redirectPending } from '../redirect-pending';
import { isRedirectReturn, redirectStarted, returnScreen } from '../redirect-return';

const mockStore = new Map<string, string>();
jest.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    getItem: (key: string) => mockStore.get(key) ?? null,
    setItem: (key: string, value: string) => void mockStore.set(key, value),
    removeItem: (key: string) => void mockStore.delete(key),
  },
}));

beforeEach(() => mockStore.clear());

describe('the way back from a gateway page', () => {
  it('is known by its path, whatever the scheme and query', () => {
    expect(isRedirectReturn('codsim://checkout/return/extension')).toBe(true);
    expect(isRedirectReturn('codsim://checkout/return/paypal?token=a&PayerID=b')).toBe(true);
    expect(isRedirectReturn('/checkout/return/extension/')).toBe(true);
    expect(isRedirectReturn('codsim://checkout')).toBe(false);
    expect(isRedirectReturn('codsim://checkout/success?outcome=paid')).toBe(false);
  });

  it('opens no screen while the app runs: the payment waiting for it takes it', () => {
    expect(redirectSystemPath({ path: 'codsim://checkout/return/extension', initial: false })).toBeNull();
  });

  it('on a fresh start hands the payment left open to checkout', () => {
    redirectStarted.write({ method: 'extension', reference: 'ref-9' });
    expect(redirectSystemPath({ path: 'codsim://checkout/return/extension?x=1', initial: true })).toBe(
      '/checkout'
    );
    expect(redirectPending.read()).toEqual({ method: 'extension', reference: 'ref-9' });
    expect(redirectStarted.read()).toBeNull();
  });

  it('on a fresh start with nothing left open goes to checkout', () => {
    expect(returnScreen(true)).toBe('/checkout');
    expect(redirectPending.read()).toBeNull();
  });
});

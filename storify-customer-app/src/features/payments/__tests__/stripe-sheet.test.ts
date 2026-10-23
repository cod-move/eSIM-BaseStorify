import { sheetParams } from '@/features/payments/stripe-sheet';
import type { SheetRequest } from '@/features/payments/stripe-sheet.types';

const RETURN_URL = 'storify://stripe-redirect';

/** An intent as a store that sends none of the wallet or customer fields answers it. */
const bare: SheetRequest = {
  publishableKey: 'pk_test_1',
  clientSecret: 'pi_1_secret_1',
  merchantDisplayName: 'Store',
};

const customerFields = ['customerId', 'customerSessionClientSecret', 'customerEphemeralKeySecret'];

describe('the Payment Sheet is set up as the intent says', () => {
  it('with every field: both wallets in the store mode, and the customer session', () => {
    const params = sheetParams(
      {
        ...bare,
        merchantCountryCode: 'US',
        testMode: true,
        customer: {
          id: 'cus_1',
          customerSessionClientSecret: 'cuss_1',
          ephemeralKeySecret: 'ek_1',
        },
      },
      RETURN_URL
    );

    expect(params).toMatchObject({
      paymentIntentClientSecret: 'pi_1_secret_1',
      merchantDisplayName: 'Store',
      returnURL: RETURN_URL,
      applePay: { merchantCountryCode: 'US' },
      googlePay: { merchantCountryCode: 'US', testEnv: true },
      customerId: 'cus_1',
      customerSessionClientSecret: 'cuss_1',
    });
    // Exactly one of the two secrets.
    expect(params).not.toHaveProperty('customerEphemeralKeySecret');
  });

  it('with none: no wallet and no customer, the sheet it always was', () => {
    const params = sheetParams(bare, RETURN_URL);

    expect(params).toEqual({
      paymentIntentClientSecret: 'pi_1_secret_1',
      merchantDisplayName: 'Store',
      returnURL: RETURN_URL,
      defaultBillingDetails: undefined,
    });
  });

  it('a test mode without a country offers no wallet', () => {
    const params = sheetParams({ ...bare, testMode: true }, RETURN_URL);

    expect(params).not.toHaveProperty('applePay');
    expect(params).not.toHaveProperty('googlePay');
  });

  it('with only the ephemeral key: the customer is set up with it', () => {
    const params = sheetParams(
      { ...bare, customer: { id: 'cus_2', ephemeralKeySecret: 'ek_2' } },
      RETURN_URL
    );

    expect(params).toMatchObject({ customerId: 'cus_2', customerEphemeralKeySecret: 'ek_2' });
    expect(params).not.toHaveProperty('customerSessionClientSecret');
  });

  it('a customer with neither secret is left out', () => {
    const params = sheetParams({ ...bare, customer: { id: 'cus_3' } }, RETURN_URL);

    for (const field of customerFields) expect(params).not.toHaveProperty(field);
  });

  it('a guest, who is sent no customer, gets wallets but never a customer', () => {
    const params = sheetParams({ ...bare, merchantCountryCode: 'GB', testMode: false }, RETURN_URL);

    expect(params).toMatchObject({ googlePay: { merchantCountryCode: 'GB', testEnv: false } });
    for (const field of customerFields) expect(params).not.toHaveProperty(field);
  });
});

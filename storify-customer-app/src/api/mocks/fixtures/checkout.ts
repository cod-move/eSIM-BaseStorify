/** The mock store's data for: checkout: the quote and placing an order. */
import type { CheckoutForm } from '@/contracts/mobile/shop/v1';

/** The delivery options, priced in the store's currency (amount, then days). */
export const SHIPPING_OPTIONS = [
  { id: 'standard', name: 'Standard', amount: 0, minDays: 5, maxDays: 7 },
  { id: 'express', name: 'Express', amount: 9.99, minDays: 1, maxDays: 2 },
] as const;

/** The store's tax rate, on the subtotal after the discount. */
export const TAX_RATE = 0.05;

/** The checkout form the mock store asks for. */
export const CHECKOUT_FORM: CheckoutForm = {
  contactMode: 'email',
  guestCheckout: true,
  addressFields: {
    firstName: { visibility: 'required' },
    lastName: { visibility: 'required' },
    apartment: { visibility: 'optional' },
    postalCode: { visibility: 'optional' },
    state: { visibility: 'optional' },
    phone: { visibility: 'optional' },
  },
  orderNote: { visibility: 'optional' },
  customFields: [
    {
      id: 'cf_gift',
      label: 'Gift message',
      type: 'textarea',
      placement: 'additional',
      visibility: 'optional',
      helpText: 'Printed on a card in the parcel',
      options: [],
    },
    {
      id: 'cf_wrap',
      label: 'Gift wrap',
      type: 'checkbox',
      placement: 'additional',
      visibility: 'optional',
      options: [],
    },
  ],
  marketing: {
    email: { offered: false, defaultChecked: false },
    sms: { offered: false },
  },
  policyLinks: [],
};

/**
 * Asks the mock for an outcome on demand: an order note that holds one of
 * these is refused on placing, or answered PRICES_CHANGED once; a gift message
 * (`cf_gift`) holding `refuseField` is refused on that field.
 */
export const MOCK_NOTE = {
  pricesChanged: 'mock:prices-changed',
  refuse: 'mock:refuse',
  refuseField: 'mock:refuse-field',
} as const;

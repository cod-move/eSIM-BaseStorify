/** The mock store's data for: the shopper's address book. */
import type { Address } from '@/contracts/mobile/shop/v1';

/** What a shopper finds in the book the first time it is opened. */
export function seededAddresses(): Address[] {
  return [
    {
      id: 'addr_seed_home',
      label: 'home',
      firstName: 'Nadia',
      lastName: 'Rahman',
      street: '221 Park Avenue',
      apartment: 'Apt 4B',
      city: 'New York',
      state: 'NY',
      postalCode: '10022',
      country: 'United States',
      phone: '+1 212 555 0148',
      isDefault: true,
    },
    {
      id: 'addr_seed_work',
      label: 'work',
      firstName: 'Nadia',
      lastName: 'Rahman',
      street: '40 Wall Street',
      apartment: 'Floor 12',
      city: 'New York',
      state: 'NY',
      postalCode: '10005',
      country: 'United States',
      phone: '+1 212 555 0199',
      isDefault: false,
    },
  ];
}

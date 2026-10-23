import type { OrderCustomerSelector } from '@/contracts/mobile/biz/v1';

export const ORDER_CUSTOMERS: OrderCustomerSelector[] = [
  {
    id: 'account:customer_amina',
    kind: 'account',
    name: 'Amina Customer',
    email: 'amina.customer@example.com',
    phone: '+8801700000001',
    addresses: [
      {
        name: 'Amina Customer',
        street: '12 Lake Road',
        city: 'Dhaka',
        country: 'BD',
        phone: '+8801700000001',
      },
    ],
  },
  {
    id: 'guest:customer_green',
    kind: 'guest',
    name: 'Green Leaf Customer',
    email: 'green.customer@example.com',
    addresses: [
      { name: 'Green Leaf Customer', street: '18 Studio Road', city: 'Dhaka', country: 'BD' },
    ],
  },
];

/** The mock store's data for: preferences. It texts nobody, so it has no SMS group. */
import type { PreferenceGroup } from '@/contracts/mobile/shop/v1';

/** A fresh copy of what a shopper starts with. */
export function seededPreferences(): PreferenceGroup[] {
  return [
    {
      key: 'EMAIL',
      title: 'Email Notifications',
      items: [
        {
          key: 'ORDER_UPDATES',
          title: 'Order Updates',
          description: 'Get notified about your order status changes.',
          enabled: true,
        },
        {
          key: 'PROMOTIONS',
          title: 'Promotions & Deals',
          description: 'Receive emails about sales and special offers.',
          enabled: false,
        },
      ],
    },
    {
      key: 'MARKETING',
      title: 'Marketing Preferences',
      items: [
        {
          key: 'MARKETING_EMAILS',
          title: 'Marketing Emails',
          description: 'Receive news, product launches and offers by email.',
          enabled: false,
        },
      ],
    },
    {
      key: 'PUSH',
      title: 'Push Notifications',
      items: [
        {
          key: 'PUSH_ORDER_UPDATES',
          title: 'Orders and payments',
          description: 'Orders, payments, returns and store credit.',
          enabled: true,
        },
        {
          key: 'PUSH_MESSAGES',
          title: 'Messages',
          description: 'Replies from the store in chat.',
          enabled: true,
        },
      ],
    },
  ];
}

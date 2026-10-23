import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { CouponList } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { CouponWallet } from '../coupon-wallet';

let mockList: CouponList;

jest.mock('../use-coupon-list', () => ({
  useCouponList: () => ({ isPending: false, isError: false, data: mockList, refetch: jest.fn() }),
}));
jest.mock('@/components/shell/tab-bar', () => ({ useBottomSpace: () => 0 }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('CouponWallet', () => {
  it('lists every coupon the store sent, the unusable ones with the store’s reason', async () => {
    mockList = {
      cartChecked: true,
      items: [
        { code: 'SAVE10', kind: 'PERCENTAGE', benefit: '10% off', conditions: [], usable: true },
        {
          code: 'BIG500',
          kind: 'FIXED',
          benefit: '৳500.00 off',
          conditions: ['On orders over ৳5,000.00'],
          usable: false,
          reason: 'MINIMUM_NOT_MET',
          reasonMessage: 'Add items worth ৳200.00 more to unlock',
        },
      ],
    };
    await render(<CouponWallet />, { wrapper: InEnglish });

    expect(screen.getByText('SAVE10')).toBeTruthy();
    expect(screen.getByText('BIG500')).toBeTruthy();
    expect(screen.getByText('Add items worth ৳200.00 more to unlock')).toBeTruthy();
    expect(screen.getAllByText('Copy code')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Copy the code SAVE10' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'BIG500, Add items worth ৳200.00 more to unlock' })
    ).toBeDisabled();
  });

  it('says there are no coupons when the store lists none', async () => {
    mockList = { cartChecked: false, items: [] };
    await render(<CouponWallet />, { wrapper: InEnglish });

    expect(screen.getByText('No coupons right now')).toBeTruthy();
  });
});

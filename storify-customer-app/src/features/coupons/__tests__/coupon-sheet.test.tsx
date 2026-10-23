import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ComponentProps, PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { CouponList } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { CouponSheet } from '../coupon-sheet';

const mockList: CouponList = {
  cartChecked: true,
  items: [
    {
      code: 'SAVE10',
      kind: 'PERCENTAGE',
      benefit: '10% off',
      conditions: ['Up to ৳300.00 off', 'Once per customer'],
      usable: true,
    },
    {
      code: 'BIG500',
      kind: 'FIXED',
      benefit: '৳500.00 off',
      conditions: ['On orders over ৳5,000.00'],
      usable: false,
      reason: 'MINIMUM_NOT_MET',
      reasonMessage: 'Add ৳200.00 more to use this code',
      shortBy: { amount: 200, currency: 'BDT', formatted: '৳200.00' },
    },
  ],
};

jest.mock('../use-coupon-list', () => ({
  useCouponList: () => ({ isPending: false, isError: false, data: mockList, refetch: jest.fn() }),
}));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

type Props = ComponentProps<typeof CouponSheet>;

function sheet(props: Partial<Props>): Props {
  return {
    visible: true,
    onClose: jest.fn(),
    coupon: undefined,
    pending: false,
    onApply: jest.fn(),
    onRemove: jest.fn(),
    ...props,
  };
}

async function type(code: string) {
  await fireEvent.changeText(screen.getByLabelText('Coupon code'), code);
  await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
}

describe('CouponSheet', () => {
  it('prints each code as the store sent it, and applies only a usable one', async () => {
    const props = sheet({});
    await render(<CouponSheet {...props} />, { wrapper: InEnglish });

    for (const text of [
      'SAVE10',
      '10% off',
      'Up to ৳300.00 off',
      'Once per customer',
      'BIG500',
      '৳500.00 off',
      'On orders over ৳5,000.00',
      'Add ৳200.00 more to use this code',
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }

    expect(screen.queryByRole('button', { name: 'Apply coupon BIG500' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'BIG500, Add ৳200.00 more to use this code' })
    ).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Apply coupon SAVE10' }));
    expect(props.onApply).toHaveBeenCalledWith('SAVE10');
  });

  it('shows the store’s reason when it refuses a typed code', async () => {
    const first = sheet({});
    const view = await render(<CouponSheet {...first} />, { wrapper: InEnglish });
    await type('  save10 ');
    expect(first.onApply).toHaveBeenCalledWith('save10');

    await view.rerender(
      <CouponSheet
        {...first}
        coupon={{
          code: 'save10',
          status: 'INVALID',
          message: 'This coupon has expired',
          reason: 'EXPIRED',
          reasonMessage: 'এই কোডের মেয়াদ শেষ',
        }}
      />
    );
    expect(screen.getByText('এই কোডের মেয়াদ শেষ')).toBeTruthy();
    expect(screen.queryByText('This coupon has expired')).toBeNull();
    expect(first.onClose).not.toHaveBeenCalled();
  });

  it('closes once the store has applied the code, and asks nothing of a code too short', async () => {
    const first = sheet({});
    const view = await render(<CouponSheet {...first} />, { wrapper: InEnglish });
    await type('ab');
    expect(first.onApply).not.toHaveBeenCalled();
    expect(screen.getByText('A coupon code has at least 3 characters.')).toBeTruthy();

    await type('SAVE10');
    await view.rerender(
      <CouponSheet
        {...first}
        coupon={{
          code: 'SAVE10',
          status: 'APPLIED',
          discount: { amount: 500, currency: 'USD', formatted: '$5.00' },
        }}
      />
    );
    expect(first.onClose).toHaveBeenCalled();
  });
});

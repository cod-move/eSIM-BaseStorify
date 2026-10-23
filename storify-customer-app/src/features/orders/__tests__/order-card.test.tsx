import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import type { OrderSummary } from '@/contracts/mobile/shop/v1';
import { getMessages } from '@/i18n/messages';

import { OrderCard } from '../order-card';

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" timeZone="UTC" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

const order: OrderSummary = {
  id: 'o1',
  number: 'ORD-1001',
  status: 'PENDING',
  placedAt: '2026-10-01T10:00:00.000Z',
  itemCount: 3,
  total: { amount: 4200, currency: 'BDT', formatted: '৳4,200.00' },
  shipments: [
    { status: 'PENDING', vendorName: 'Storify' },
    { status: 'PENDING', vendorName: 'Sonic Circuit Audio' },
  ],
};

describe('OrderCard', () => {
  it('shows one status for the order, not one per seller', async () => {
    await render(
      <OrderCard order={order} onView={jest.fn()} onTrack={jest.fn()} onReturn={jest.fn()} />,
      {
        wrapper: InEnglish,
      }
    );

    expect(screen.getAllByText('Pending')).toHaveLength(1);
    expect(screen.queryByText('From Storify')).toBeNull();
    expect(screen.queryByText('From Sonic Circuit Audio')).toBeNull();
    expect(screen.getByText(/ORD-1001/)).toBeTruthy();
    expect(screen.getByText('৳4,200.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Track Order' })).toBeTruthy();
  });

  it.each(['DELIVERED', 'CANCELLED'])('offers View Order, not Track, once %s', async (status) => {
    await render(
      <OrderCard
        order={{ ...order, status }}
        onView={jest.fn()}
        onTrack={jest.fn()}
        onReturn={jest.fn()}
      />,
      { wrapper: InEnglish }
    );

    expect(screen.getByRole('button', { name: 'View Order' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Track Order' })).toBeNull();
  });

  it('offers Track Order while shipped', async () => {
    await render(
      <OrderCard
        order={{ ...order, status: 'SHIPPED' }}
        onView={jest.fn()}
        onTrack={jest.fn()}
        onReturn={jest.fn()}
      />,
      { wrapper: InEnglish }
    );

    expect(screen.getByRole('button', { name: 'Track Order' })).toBeTruthy();
  });

  it('offers Request return beside View Order when the store says the order can be returned', async () => {
    const onReturn = jest.fn();
    const onView = jest.fn();
    await render(
      <OrderCard
        order={{ ...order, status: 'DELIVERED', canReturn: true }}
        onView={onView}
        onTrack={jest.fn()}
        onReturn={onReturn}
      />,
      { wrapper: InEnglish }
    );

    expect(screen.getByRole('button', { name: 'View Order' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Request return' }));
    expect(onReturn).toHaveBeenCalledTimes(1);
    expect(onView).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    'offers no return, and says nothing of it, when canReturn is %s',
    async (canReturn) => {
      await render(
        <OrderCard
          order={{ ...order, status: 'DELIVERED', canReturn }}
          onView={jest.fn()}
          onTrack={jest.fn()}
          onReturn={jest.fn()}
        />,
        { wrapper: InEnglish }
      );

      expect(screen.getByRole('button', { name: 'View Order' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Request return' })).toBeNull();
    }
  );
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import { IntlProvider } from 'use-intl';

import type { MeProduct, OrderLine } from '@/contracts/mobile/shop/v1';
import { useMeProduct } from '@/features/catalog/use-wishlist';
import { getMessages } from '@/i18n/messages';

import { LineReview } from '../line-review';

jest.mock('@/features/catalog/use-wishlist', () => ({ useMeProduct: jest.fn() }));

const line: OrderLine = {
  index: 0,
  productId: 'p-1',
  name: 'Linen shirt',
  quantity: 1,
  unitPrice: { amount: 20, currency: 'USD', formatted: '$20.00' },
  lineTotal: { amount: 20, currency: 'USD', formatted: '$20.00' },
  finalSale: false,
};

async function renderLine(me: Pick<MeProduct, 'canReview'> | undefined) {
  // The button reads only `data.canReview`; the rest of the query result is not its business.
  jest.mocked(useMeProduct).mockReturnValue({ data: me } as ReturnType<typeof useMeProduct>);
  const onWrite = jest.fn();
  await render(
    <IntlProvider locale="en" messages={getMessages('en')}>
      <LineReview line={line} onWrite={onWrite} />
    </IntlProvider>
  );
  return onWrite;
}

describe('Write a review under an order line', () => {
  it('shows when the store says the product may be reviewed, and opens the review', async () => {
    const onWrite = await renderLine({ canReview: true });

    await fireEvent.press(screen.getByRole('button', { name: 'Write a review of Linen shirt' }));
    expect(useMeProduct).toHaveBeenCalledWith('p-1');
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when the store says no, or has not answered', async () => {
    await renderLine({ canReview: false });
    expect(screen.queryByRole('button')).toBeNull();

    await renderLine(undefined);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

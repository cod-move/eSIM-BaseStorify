import { fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { IntlProvider } from 'use-intl';

import type { ProductCard as ProductCardData } from '@/contracts/mobile/shop/v1';
import en from '@/i18n/messages/en.json';
import { loadPluralRules } from '@/i18n/polyfills';

import { ProductCard, type ProductCardVariant } from '../product-card';
import { cardAction, cardAvailability } from '../product-card-parts';

jest.setTimeout(30_000);

/** A product as a list sends it; each test changes the fields it is about. */
function card(extra: Partial<ProductCardData> = {}): ProductCardData {
  return {
    id: 'p1',
    slug: 'cotton-tee',
    name: 'Cotton tee',
    price: { amount: 24, currency: 'USD', formatted: '$24.00' },
    priceVaries: false,
    rating: { average: 4.5, count: 120 },
    availability: 'IN_STOCK',
    requiresVariantChoice: false,
    priceOnRequest: false,
    isDigital: false,
    purchasableInApp: true,
    ...extra,
  };
}

type Props = Partial<Parameters<typeof ProductCard>[0]>;

async function show(product: ProductCardData, props: Props = {}) {
  await loadPluralRules('en');
  const onPress = jest.fn();
  const onAddToCart = jest.fn();
  const onToggleWishlist = jest.fn();
  await renderRouter({
    index: () => (
      <IntlProvider locale="en" messages={en}>
        <ProductCard
          product={product}
          onPress={onPress}
          onAddToCart={onAddToCart}
          onToggleWishlist={onToggleWishlist}
          {...props}
        />
      </IntlProvider>
    ),
  });
  await screen.findByRole('link');
  return { onPress, onAddToCart, onToggleWishlist };
}

const label = (text: string) => screen.queryByText(text);
const button = (name: string) => screen.queryByRole('button', { name });

describe('which label and which button a product shows', () => {
  // [what the store said, the words over the picture, the button]
  const CASES: [string, Partial<ProductCardData>, string | null, string | null][] = [
    ['in stock', {}, null, 'Add to Cart'],
    ['in stock, an option to choose', { requiresVariantChoice: true }, null, 'Choose options'],
    ['pre-order', { availability: 'PRE_ORDER' }, 'Pre-order', 'Add to Cart'],
    [
      'pre-order, an option to choose',
      { availability: 'PRE_ORDER', requiresVariantChoice: true },
      'Pre-order',
      'Choose options',
    ],
    ['out of stock', { availability: 'OUT_OF_STOCK' }, 'Out of Stock', null],
    [
      'out of stock, an option to choose',
      { availability: 'OUT_OF_STOCK', requiresVariantChoice: true },
      'Out of Stock',
      null,
    ],
    ['sold by quote', { priceOnRequest: true, price: undefined }, null, null],
    ['not for sale in the app', { purchasableInApp: false, isDigital: true }, null, null],
  ];

  it.each(CASES)('%s', async (_name, fields, words, action) => {
    await show(card(fields));

    for (const text of ['Out of Stock', 'Pre-order']) {
      if (text === words) expect(label(text)).toBeTruthy();
      else expect(label(text)).toBeNull();
    }
    for (const name of ['Add to Cart', 'Choose options']) {
      if (name === action) expect(button(name)).toBeTruthy();
      else expect(button(name)).toBeNull();
    }
  });

  it('is decided by the fields alone', () => {
    expect(cardAction(card())).toBe('add');
    expect(cardAction(card({ requiresVariantChoice: true }))).toBe('options');
    expect(cardAction(card({ availability: 'OUT_OF_STOCK' }))).toBeNull();
    expect(cardAvailability(card({ availability: 'PRE_ORDER' }))).toBe('preOrder');
    expect(cardAvailability(card())).toBeNull();
  });

  it('says "Price on request" instead of a price when the product is sold by quote', async () => {
    await show(card({ priceOnRequest: true, price: undefined }));
    expect(label('Price on request')).toBeTruthy();
    expect(label('$24.00')).toBeNull();
  });

  it('prints the price as the store formatted it, without "From" when it is discounted', async () => {
    await show(
      card({
        priceVaries: true,
        compareAtPrice: { amount: 30, currency: 'USD', formatted: '$30.00' },
      })
    );
    expect(label('$24.00')).toBeTruthy();
    expect(label('$30.00')).toBeTruthy();
  });

  it('always says "Sponsored" for a paid placement, whatever else it says', async () => {
    await show(card({ sponsored: { campaignId: 'c1' }, availability: 'OUT_OF_STOCK' }));
    expect(label('Sponsored')).toBeTruthy();
    expect(label('Out of Stock')).toBeTruthy();
  });

  it('shows no button when the screen gave no way to add', async () => {
    await show(card(), { onAddToCart: undefined, onToggleWishlist: undefined });
    expect(button('Add to Cart')).toBeNull();
    expect(button('Add to wishlist')).toBeNull();
  });
});

describe('what a tap does', () => {
  it('opens the product from the card, and adds from the button without opening it', async () => {
    const product = card();
    const { onPress, onAddToCart } = await show(product);

    // The button is beside the card's link, not inside it.
    expect(within(screen.getByRole('link')).queryByRole('button')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Add to Cart' }));
    expect(onAddToCart).toHaveBeenCalledWith(product);
    expect(onPress).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('link'));
    expect(onPress).toHaveBeenCalledWith(product);
  });

  it('cannot be pressed again while the screen is adding', async () => {
    await show(card(), { busy: true });
    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeDisabled();
  });

  it('toggles the wishlist from the heart', async () => {
    const product = card();
    const { onToggleWishlist, onPress } = await show(product);

    await fireEvent.press(screen.getByRole('button', { name: 'Add to wishlist' }));
    expect(onToggleWishlist).toHaveBeenCalledWith(product);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('names the heart by what pressing it does', async () => {
    await show(card(), { isWishlisted: true });
    expect(button('Remove from wishlist')).toBeTruthy();
    expect(button('Add to wishlist')).toBeNull();
  });
});

describe('every variant', () => {
  const VARIANTS: ProductCardVariant[] = ['grid', 'compact', 'rail', 'plain', 'row'];

  it('speaks the labels, the price and the rating after the name', async () => {
    await show(card({ sponsored: { campaignId: 'c1' }, availability: 'PRE_ORDER' }));
    const link = screen.getByRole('link', { name: 'Cotton tee' });
    expect(link.props.accessibilityValue).toEqual({
      text: 'Sponsored. Pre-order. $24.00. 4.5, 120 reviews',
    });
  });

  it.each(VARIANTS)(
    '%s names the product, its price and its labels as one link',
    async (variant) => {
      await show(card({ sponsored: { campaignId: 'c1' }, availability: 'PRE_ORDER' }), { variant });

      const link = screen.getByRole('link', { name: 'Cotton tee' });
      expect(within(link).getByText('$24.00')).toBeTruthy();
      expect(within(link).getByText('Pre-order')).toBeTruthy();
      expect(within(link).getByText('Sponsored')).toBeTruthy();
    }
  );

  it.each(VARIANTS.filter((variant) => variant !== 'grid'))(
    '%s has no cart button, the grid card has',
    async (variant) => {
      await show(card(), { variant });
      expect(button('Add to Cart')).toBeNull();
    }
  );
});

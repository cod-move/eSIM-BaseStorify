import type { ImageSet, ProductVariant } from '@/contracts/mobile/shop/v1';

import { pictureOfChoice } from '../purchase-state';

const picture = (name: string): ImageSet => ({ thumb: name, card: name, full: name });

const variant = (id: string, values: string[], image?: ImageSet): ProductVariant => ({
  id,
  optionValueIds: values,
  availability: 'IN_STOCK',
  maxQuantity: 5,
  image,
});

// Colour (green, black) by storage (256, 512); the black 256 has no picture of its own.
const product = {
  variants: [
    variant('v1', ['green', '256'], picture('green.png')),
    variant('v2', ['green', '512'], picture('green.png')),
    variant('v3', ['black', '256']),
    variant('v4', ['black', '512'], picture('black.png')),
  ],
};

describe('pictureOfChoice', () => {
  it('shows a colour picked before the storage', () => {
    expect(pictureOfChoice(product, { colour: 'green' })?.full).toBe('green.png');
    expect(pictureOfChoice(product, { colour: 'black' })?.full).toBe('black.png');
  });

  it('follows every value picked', () => {
    expect(pictureOfChoice(product, { colour: 'black', storage: '512' })?.full).toBe('black.png');
    expect(pictureOfChoice(product, { colour: 'black', storage: '256' })).toBeUndefined();
  });

  it('shows nothing of its own before a pick', () => {
    expect(pictureOfChoice(product, {})).toBeUndefined();
  });
});

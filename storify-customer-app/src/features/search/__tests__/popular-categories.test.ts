import type { Category } from '@/contracts/mobile/shop/v1';

import { popularCategories } from '../popular-categories';

function category(id: string, children: Category[] = []): Category {
  return { id, slug: id, name: id, children };
}

const ids = (categories: Category[]) => categories.map((c) => c.id);

describe('popularCategories', () => {
  it('puts the sub-categories first, then fills from the top level until there are ten', () => {
    const tree = [
      category('a'),
      category('b'),
      category('phones', [category('accessories'), category('handsets', [category('iphone')])]),
      ...['c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id) => category(id)),
    ];

    expect(ids(popularCategories(tree))).toEqual([
      'accessories',
      'handsets',
      'a',
      'b',
      'phones',
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
  });

  it('goes down a level at a time once the top level is used up', () => {
    const tree = [
      category('a', [category('a1', [category('a1x')]), category('a2')]),
      category('b', [category('b1')]),
    ];

    expect(ids(popularCategories(tree))).toEqual(['a1', 'a2', 'b1', 'a', 'b', 'a1x']);
  });

  it('shows the top level alone when the store has no sub-categories', () => {
    expect(ids(popularCategories([category('a'), category('b')]))).toEqual(['a', 'b']);
  });

  it('shows a category once, even when the store lists it twice', () => {
    const shared = category('shared');
    expect(ids(popularCategories([category('a', [shared]), shared]))).toEqual(['shared', 'a']);
  });

  it('shows nothing for a store without categories', () => {
    expect(popularCategories([])).toEqual([]);
  });
});

import type { HomeBlock } from '@/contracts/mobile/shop/v1';

import { drawnBlocks } from '../home-screen';

const spacer = (id: string) => ({ type: 'SPACER', id, height: 36 }) as HomeBlock;
const heading = (id: string) =>
  ({ type: 'HEADING', id, title: 'Top', align: 'CENTER', size: 'LARGE' }) as HomeBlock;
const collections = (id: string): HomeBlock => ({
  type: 'COLLECTION_LIST',
  id,
  title: 'Collections',
  collections: [],
});

describe('drawnBlocks', () => {
  it('leaves out the kinds that draw nothing, and the spacers left at the end', () => {
    const blocks = [
      heading('a'),
      spacer('b'),
      heading('c'),
      spacer('d'),
      collections('e'),
      spacer('f'),
    ];

    expect(drawnBlocks(blocks).map((block) => block.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps a spacer between two blocks it draws', () => {
    expect(drawnBlocks([heading('a'), spacer('b'), heading('c')])).toHaveLength(3);
  });
});

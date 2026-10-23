import { dedupeById } from '../dedupe';

type Card = { id: string; title: string; sponsored?: boolean };

describe('dedupeById', () => {
  it('keeps the first of each id, in place', () => {
    const cards: Card[] = [
      { id: 'a', title: 'Placed', sponsored: true },
      { id: 'b', title: 'Second' },
      { id: 'a', title: 'The same product, among the organic ones' },
      { id: 'c', title: 'Third' },
      { id: 'b', title: 'Second again' },
    ];

    expect(dedupeById(cards)).toEqual([
      { id: 'a', title: 'Placed', sponsored: true },
      { id: 'b', title: 'Second' },
      { id: 'c', title: 'Third' },
    ]);
  });

  it('removes a card repeated on a later page of the flattened pages', () => {
    const pages = [
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      [
        { id: 'c', title: 'C' },
        { id: 'a', title: 'A' },
      ],
    ];

    expect(dedupeById(pages.flat()).map((card) => card.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves its input alone, and an empty list empty', () => {
    const cards: Card[] = [
      { id: 'a', title: 'A' },
      { id: 'a', title: 'A' },
    ];

    dedupeById(cards);

    expect(cards).toHaveLength(2);
    expect(dedupeById([])).toEqual([]);
  });
});

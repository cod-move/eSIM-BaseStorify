import { matchTopups, pageOf } from '../topup-filter';

const offers = [
  { name: 'Europe 5GB', data: '5 GB', validityDays: 30 },
  { name: 'Europe 1GB', data: '1 GB', validityDays: 7 },
  { name: 'Asia 500MB', data: '500 MB', validityDays: 7 },
];

describe('top-up search', () => {
  it('keeps everything without a query', () => {
    expect(matchTopups(offers, '  ')).toHaveLength(3);
  });

  it('matches name, data and days, every word', () => {
    expect(matchTopups(offers, 'europe').map((offer) => offer.data)).toEqual(['5 GB', '1 GB']);
    expect(matchTopups(offers, '5 gb').map((offer) => offer.name)).toEqual(['Europe 5GB']);
    expect(matchTopups(offers, '7 days').map((offer) => offer.name)).toEqual(['Europe 1GB', 'Asia 500MB']);
    expect(matchTopups(offers, '7天 asia').map((offer) => offer.name)).toEqual(['Asia 500MB']);
    expect(matchTopups(offers, 'africa')).toEqual([]);
  });
});

describe('top-up pages', () => {
  const items = Array.from({ length: 23 }, (_, index) => index);

  it('cuts pages of ten and keeps the page in range', () => {
    expect(pageOf(items, 0)).toEqual({ items: items.slice(0, 10), page: 0, pages: 3 });
    expect(pageOf(items, 2).items).toEqual([20, 21, 22]);
    expect(pageOf(items, 9).page).toBe(2);
    expect(pageOf([], 0)).toEqual({ items: [], page: 0, pages: 1 });
  });
});

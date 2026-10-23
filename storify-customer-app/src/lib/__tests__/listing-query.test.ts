import { listingQueryFromHref, listingQueryFromWords, queryWordsOf } from '../listing-query';

describe('listingQueryFromWords', () => {
  it('turns the website words into the words of the app', () => {
    expect(
      listingQueryFromWords({
        search: 'red shoe',
        sortBy: 'price-asc',
        stock: 'in-stock',
        minPrice: '10',
        maxPrice: '99.5',
        brand: 'nike',
        category: 'shoes',
        collection: 'summer',
        vendor: 'north-trail',
      })
    ).toEqual({
      q: 'red shoe',
      sort: 'PRICE_ASC',
      inStock: true,
      minPrice: 10,
      maxPrice: 99.5,
      brand: 'nike',
      category: 'shoes',
      collection: 'summer',
      vendor: 'north-trail',
    });
  });

  it.each([
    ['createdAt', 'NEWEST'],
    ['price-asc', 'PRICE_ASC'],
    ['price-desc', 'PRICE_DESC'],
    ['popular', 'POPULAR'],
    ['rating', 'RATING'],
    ['relevance', 'RELEVANCE'],
    ['CREATEDAT', 'NEWEST'],
  ])('reads sortBy=%s as %s', (sortBy, sort) => {
    expect(listingQueryFromWords({ sortBy })).toEqual({ sort });
  });

  it('keeps a comma list of slugs together, clean and without repeats', () => {
    expect(listingQueryFromWords({ brand: 'apple, samsung,,apple' })).toEqual({
      brand: 'apple,samsung',
    });
    expect(listingQueryFromWords({ category: ['mobile-phones', 'gaming,mobile-phones'] })).toEqual({
      category: 'mobile-phones,gaming',
    });
    expect(listingQueryFromWords({ vendor: ' , ' })).toEqual({});
  });

  it('lets the words of the app itself through', () => {
    expect(
      listingQueryFromWords({ q: 'bag', sort: 'PRICE_DESC', onSale: 'true', inStock: '1' })
    ).toEqual({ q: 'bag', sort: 'PRICE_DESC', onSale: true, inStock: true });
    // The website's word wins when both are given.
    expect(listingQueryFromWords({ search: 'shoe', q: 'bag' })).toEqual({ q: 'shoe' });
  });

  it('leaves out what it cannot read, instead of failing the whole link', () => {
    expect(
      listingQueryFromWords({
        sortBy: 'bestseller',
        stock: 'out-of-stock',
        minPrice: 'cheap',
        maxPrice: '-5',
        onSale: 'maybe',
        search: '   ',
        colour: 'red',
      })
    ).toEqual({});
  });

  it('keeps a price of zero', () => {
    expect(listingQueryFromWords({ minPrice: '0' })).toEqual({ minPrice: 0 });
  });
});

describe('listingQueryFromHref', () => {
  it('reads the link of a home block', () => {
    expect(listingQueryFromHref('/products?sortBy=createdAt')).toEqual({ sort: 'NEWEST' });
    expect(listingQueryFromHref('/products?brand=north-trail')).toEqual({ brand: 'north-trail' });
  });

  it('reads a link a merchant wrote', () => {
    expect(
      listingQueryFromHref(
        'https://shop.example.com/bn/products?search=red%20shoe&sortBy=price-desc&stock=in-stock&minPrice=10&brand=a,b#top'
      )
    ).toEqual({ q: 'red shoe', sort: 'PRICE_DESC', inStock: true, minPrice: 10, brand: 'a,b' });
  });

  it('is empty for a link without words', () => {
    expect(listingQueryFromHref('/products')).toEqual({});
    expect(listingQueryFromHref('/products?')).toEqual({});
  });
});

describe('queryWordsOf', () => {
  it('splits, decodes and keeps repeated words', () => {
    expect(queryWordsOf('/products?brand=a&brand=b&q=red+shoe&c=%E0%A4%A&d=1=2')).toEqual({
      brand: ['a', 'b'],
      q: ['red shoe'],
      c: ['%E0%A4%A'],
      d: ['1=2'],
    });
  });

  it('cannot be made to carry a prototype', () => {
    const words = queryWordsOf('/products?__proto__=x');
    expect(Object.getPrototypeOf(words)).toBe(Object.prototype);
    expect(Object.keys(words)).toEqual(['__proto__']);
  });
});

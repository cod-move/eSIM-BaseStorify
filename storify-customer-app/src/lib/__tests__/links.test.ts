import { joinWebsiteUrl, resolveAppLink, toAppPath } from '../links';

describe('toAppPath', () => {
  it.each([
    ['https://shop.example.com/bn/products/red-shoe?ref=push', '/products/red-shoe?ref=push'],
    ['https://shop.example.com/products/red-shoe', '/products/red-shoe'],
    ['https://shop.example.com', '/'],
    ['https://shop.example.com/ar', '/'],
    ['storify://products/red-shoe', '/products/red-shoe'],
    ['storify:///cart', '/cart'],
    ['storify://', '/'],
    ['/bn/cart', '/cart'],
    ['/cart#top', '/cart'],
    ['products?category=bags', '/products?category=bags'],
  ])('%s → %s', (input, expected) => {
    expect(toAppPath(input)).toBe(expected);
  });

  it('takes a language off the front only when it is the whole first part', () => {
    // "brands" starts with "bn"-like letters, "hats" with "ha": neither is a language prefix.
    expect(toAppPath('/brands/north-trail')).toBe('/brands/north-trail');
    expect(toAppPath('/hats')).toBe('/hats');
  });
});

describe('joinWebsiteUrl', () => {
  it.each([
    ['https://shop.example.com/', '/account/orders/7', 'https://shop.example.com/account/orders/7'],
    ['https://shop.example.com', '/account/orders/7', 'https://shop.example.com/account/orders/7'],
    ['https://shop.example.com/', 'account/orders/7', 'https://shop.example.com/account/orders/7'],
    ['https://shop.example.com//', '//account', 'https://shop.example.com/account'],
    [
      'https://shop.example.com/',
      '/products?sortBy=createdAt',
      'https://shop.example.com/products?sortBy=createdAt',
    ],
    ['https://shop.example.com/shop/', '/cart', 'https://shop.example.com/shop/cart'],
    ['https://shop.example.com/', '/', 'https://shop.example.com/'],
  ])('%s + %s → %s', (website, path, expected) => {
    expect(joinWebsiteUrl(website, path)).toBe(expected);
  });

  it('never makes a double slash after the host', () => {
    expect(joinWebsiteUrl('https://shop.example.com/', '/bn/blog/summer').includes('com//')).toBe(
      false
    );
  });
});

describe('resolveAppLink', () => {
  it('returns the path of a screen the app has', () => {
    expect(resolveAppLink('/products/red-shoe')).toBe('/products/red-shoe');
    expect(resolveAppLink('https://shop.example.com/ar/products?onSale=true')).toBe(
      '/products?onSale=true'
    );
    expect(resolveAppLink('/bn')).toBe('/');
  });

  it('opens the account screens that notifications and the header link to', () => {
    expect(resolveAppLink('/en/account/orders/66f1c0ffee')).toBe('/account/orders/66f1c0ffee');
    expect(resolveAppLink('/account/orders')).toBe('/account/orders');
    expect(resolveAppLink('/account/wishlist')).toBe('/account/wishlist');
    expect(resolveAppLink('/account/notifications')).toBe('/account/notifications');
    expect(resolveAppLink('/track-order?order=ORD000235')).toBe('/track-order?order=ORD000235');
    expect(resolveAppLink('/vendors/sonic-circuit')).toBe('/vendors/sonic-circuit');
    expect(resolveAppLink('/brands/apple')).toBe('/brands/apple');
    expect(resolveAppLink('/categories/cameras')).toBe('/categories/cameras');
  });

  it('opens "Become a vendor" as the app’s own screen', () => {
    expect(resolveAppLink('/bn/become-vendor')).toBe('/sell');
  });

  it('returns null for a page only the website has', () => {
    expect(resolveAppLink('/marketing')).toBeNull();
    expect(resolveAppLink('/account/quotes')).toBeNull();
    expect(resolveAppLink('/vendor/dashboard')).toBeNull();
    expect(resolveAppLink('/products/red-shoe/reviews')).toBeNull();
  });
});

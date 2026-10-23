import { pageTitle, readPageUrl } from '../page-params';

describe('the in-app web page address', () => {
  it('opens only an http or https address', () => {
    expect(readPageUrl('https://shop.test/blog')).toBe('https://shop.test/blog');
    expect(readPageUrl(['http://shop.test/faq', 'https://other.test'])).toBe(
      'http://shop.test/faq'
    );
    expect(readPageUrl('javascript:alert(1)')).toBeNull();
    expect(readPageUrl('file:///etc/hosts')).toBeNull();
    expect(readPageUrl(undefined)).toBeNull();
  });

  it('titles the page as the link said, else by its host', () => {
    expect(pageTitle('https://shop.test/terms', 'Terms')).toBe('Terms');
    expect(pageTitle('https://shop.test/blog/a?x=1', undefined)).toBe('shop.test');
    expect(pageTitle(null, ' ')).toBe('');
  });
});

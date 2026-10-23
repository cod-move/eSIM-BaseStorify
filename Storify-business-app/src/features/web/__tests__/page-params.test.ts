import { pageTitle, readPageUrl } from '../page-params';

describe('the in-app web page address', () => {
  it('opens only an http or https address', () => {
    expect(readPageUrl('https://shop.test/en/login')).toBe('https://shop.test/en/login');
    expect(readPageUrl(['http://carrier.test/t/1', 'https://other.test'])).toBe(
      'http://carrier.test/t/1'
    );
    expect(readPageUrl('javascript:alert(1)')).toBeNull();
    expect(readPageUrl('file:///etc/hosts')).toBeNull();
    expect(readPageUrl('storifybiz://orders/1')).toBeNull();
    expect(readPageUrl(undefined)).toBeNull();
  });

  it('titles the page as the link said, else by the store or the host', () => {
    const store = { name: 'Acme', websiteUrl: 'https://Shop.test/' };
    expect(pageTitle('https://shop.test/en/login', 'Report.pdf', store)).toBe('Report.pdf');
    expect(pageTitle('https://shop.test/en/admin/settings', undefined, store)).toBe('Acme');
    expect(pageTitle('https://shop.test.evil.example/x', undefined, store)).toBe(
      'shop.test.evil.example'
    );
    expect(pageTitle('https://carrier.test/track/a?x=1', undefined, store)).toBe('carrier.test');
    expect(pageTitle('https://carrier.test/track', undefined)).toBe('carrier.test');
    expect(pageTitle(null, ' ')).toBe('');
  });
});

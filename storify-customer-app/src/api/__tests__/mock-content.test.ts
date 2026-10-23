import {
  AboutPage,
  BlogArticle,
  BlogArticleList,
  ContactPage,
  ContentPage,
  FaqPage,
  ReturnPolicyPage,
} from '@/contracts/mobile/shop/v1';

import { resetMockServer } from '../mocks/server';
import { call, dataOf } from './mock-helpers';

beforeEach(resetMockServer);

describe("the store's own pages", () => {
  it('answers a page by its handle, in the shape of the contract', async () => {
    const page = await dataOf(ContentPage, '/pages/privacy');
    expect(page).toMatchObject({ handle: 'privacy', title: 'Privacy policy' });
    expect(page.html).toContain('<h2>');
    expect((await dataOf(ContentPage, '/pages/shipping')).updatedAt).toBeTruthy();
  });

  it('answers 404 for a hidden page, and WEB_ONLY for one only the website shows', async () => {
    const hidden = await call('/pages/cookies');
    expect(hidden.response.status).toBe(404);
    expect(hidden.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(hidden.body.reason).toBeUndefined();

    const landing = await call('/pages/summer-sale');
    expect(landing.response.status).toBe(404);
    expect(landing.body).toMatchObject({ code: 'NOT_FOUND', reason: 'WEB_ONLY' });
  });

  it('answers the FAQ', async () => {
    const faq = await dataOf(FaqPage, '/faq');
    expect(faq.items.length).toBeGreaterThan(0);
  });

  it('answers About, Contact and the return policy in the shape of the contract', async () => {
    expect((await dataOf(AboutPage, '/about')).stats.length).toBeGreaterThan(1);
    expect((await dataOf(ContactPage, '/contact')).details.email?.href).toMatch(/^mailto:/);
    expect((await dataOf(ReturnPolicyPage, '/return-policy')).window.value).toBe('30 days');
  });
});

describe('the blog', () => {
  it('pages through the articles, with the categories on every page', async () => {
    const first = await dataOf(BlogArticleList, '/blog?limit=20');
    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.slug).toBe('what-to-carry-every-day');
    expect(first.categories.map((category) => category.slug)).toEqual(['guides', 'home']);
    expect(first.nextCursor).not.toBeNull();

    const second = await dataOf(BlogArticleList, `/blog?limit=20&cursor=${first.nextCursor}`);
    expect(second.nextCursor).toBeNull();
    expect(second.items.length).toBeGreaterThan(0);
  });

  it('narrows the list to a category or a tag', async () => {
    const guides = await dataOf(BlogArticleList, '/blog?category=guides');
    expect(guides.items.map((article) => article.slug)).toEqual([
      'what-to-carry-every-day',
      'choosing-earbuds',
    ]);
    const bags = await dataOf(BlogArticleList, '/blog?tag=bags');
    expect(bags.items.map((article) => article.slug)).toEqual(['what-to-carry-every-day']);
  });

  it('answers every article of the home block, and 404 for one it does not have', async () => {
    for (const slug of ['what-to-carry-every-day', 'choosing-earbuds', 'a-calmer-desk']) {
      const article = await dataOf(BlogArticle, `/blog/${slug}`);
      expect(article.slug).toBe(slug);
      expect(article.html).toBeTruthy();
    }
    const { response, body } = await call('/blog/nothing-here');
    expect(response.status).toBe(404);
    expect(body).toMatchObject({ success: false, code: 'NOT_FOUND' });
  });
});

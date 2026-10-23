/** The store's own pages, its FAQ and its blog. */
import { ContactMessageRequest, type BlogArticleList } from '@/contracts/mobile/shop/v1';

import {
  aboutPage,
  contactMessageResult,
  contactPage,
  returnPolicyPage,
} from '../fixtures/content-pages';
import { faqPage, findBlogArticle, findContentPage, listBlogArticles } from '../fixtures/content';
import { MockError, type MockContext, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: /^\/pages\/([^/]+)$/,
    handle: (_ctx, [handle = '']) => {
      const page = findContentPage(handle);
      if (page === 'web-only') {
        throw new MockError(
          404,
          'NOT_FOUND',
          'This page is shown on the website only.',
          'WEB_ONLY'
        );
      }
      if (!page) throw new MockError(404, 'NOT_FOUND', 'This page is not available.');
      return page;
    },
  },
  { method: 'GET', path: '/faq', handle: () => faqPage },
  { method: 'GET', path: '/about', handle: () => aboutPage },
  { method: 'GET', path: '/contact', handle: () => contactPage },
  { method: 'GET', path: '/return-policy', handle: () => returnPolicyPage },
  { method: 'POST', path: '/contact/messages', handle: contactMessage },
  { method: 'GET', path: '/blog', handle: blogList },
  {
    method: 'GET',
    path: /^\/blog\/([^/]+)$/,
    handle: (_ctx, [slug = '']) => {
      const article = findBlogArticle(slug);
      if (!article) throw new MockError(404, 'NOT_FOUND', 'This article is not available.');
      return article;
    },
  },
];

/** A page of the list. The cursor is opaque to the app; here it happens to be an offset. */
function blogList({ query }: MockContext): BlogArticleList {
  const { items, categories } = listBlogArticles({
    category: query.get('category') ?? undefined,
    tag: query.get('tag') ?? undefined,
  });
  const offset = Number(query.get('cursor') ?? 0);
  const limit = Math.min(Number(query.get('limit') ?? 20), 40);
  return {
    items: items.slice(offset, offset + limit),
    nextCursor: offset + limit < items.length ? String(offset + limit) : null,
    categories,
  };
}

/** The contact form, checked as the store checks it. */
function contactMessage({ body, user }: MockContext) {
  const parsed = ContactMessageRequest.safeParse(body);
  if (!parsed.success)
    throw new MockError(400, 'VALIDATION_ERROR', 'Check the highlighted fields.');
  const result = contactMessageResult(parsed.data, Boolean(user));
  if (result === 'refused') throw new MockError(500, 'INTERNAL_ERROR', 'Something went wrong.');
  return result;
}

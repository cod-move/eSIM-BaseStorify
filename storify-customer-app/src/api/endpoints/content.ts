import {
  AboutPage,
  BlogArticle,
  BlogArticleList,
  ContactMessageResult,
  ContactPage,
  ContentPage,
  FaqPage,
  ReturnPolicyPage,
  type BlogArticleListQuery,
  type ContactMessageRequest,
} from '@/contracts/mobile/shop/v1';

import { api } from '../api';
import type { Conditional } from '../etag-query';

/** GET /pages/{handle}: `privacy`, `terms`, `cookies`, `accessibility`, or a page of the merchant's own. */
export function getContentPage(locale: string, handle: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/pages/${encodeURIComponent(handle)}`, etag, signal },
    ContentPage
  );
}

/** GET /faq: the store's questions and answers. */
export function getFaq(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/faq', etag, signal }, FaqPage);
}

/** GET /about: the website's /about, part by part. */
export function getAboutPage(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/about', etag, signal }, AboutPage);
}

/** GET /contact: the store's ways to be reached, and the form's heading. */
export function getContactPage(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/contact', etag, signal }, ContactPage);
}

/** GET /return-policy: the website's /returns. */
export function getReturnPolicy(locale: string, { etag, signal }: Conditional) {
  return api.request({ locale, path: '/return-policy', etag, signal }, ReturnPolicyPage);
}

/**
 * POST /contact/messages: the contact form. One `idempotencyKey` per message:
 * a retry with it is answered as the first was, never sent twice. Signed in,
 * it comes from the shopper's account.
 */
export function sendContactMessage(
  locale: string,
  body: ContactMessageRequest,
  idempotencyKey: string
) {
  return api.data(
    { locale, path: '/contact/messages', method: 'POST', body, auth: 'optional', idempotencyKey },
    ContactMessageResult
  );
}

/** GET /blog: the published articles, newest first, a page at a time. */
export function getBlogArticles(locale: string, query: BlogArticleListQuery, signal: AbortSignal) {
  return api.data({ locale, path: '/blog', query, signal }, BlogArticleList);
}

/** GET /blog/{slug}: one published article. */
export function getBlogArticle(locale: string, slug: string, { etag, signal }: Conditional) {
  return api.request(
    { locale, path: `/blog/${encodeURIComponent(slug)}`, etag, signal },
    BlogArticle
  );
}

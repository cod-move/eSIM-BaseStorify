import type { BlogArticleListQuery } from '@/contracts/mobile/shop/v1';

export const contentKeys = {
  contentPage: (locale: string, handle: string) => ['public', locale, 'page', handle] as const,
  faq: (locale: string) => ['public', locale, 'faq'] as const,
  aboutPage: (locale: string) => ['public', locale, 'about'] as const,
  contactPage: (locale: string) => ['public', locale, 'contact'] as const,
  returnPolicy: (locale: string) => ['public', locale, 'return-policy'] as const,
  blogArticles: (locale: string, query: BlogArticleListQuery) =>
    ['public', locale, 'blog', query] as const,
  blogArticle: (locale: string, slug: string) => ['public', locale, 'blog-article', slug] as const,
};

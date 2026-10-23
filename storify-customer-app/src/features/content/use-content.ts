import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useRef } from 'react';

import {
  getAboutPage,
  getBlogArticle,
  getBlogArticles,
  getContactPage,
  getContentPage,
  getFaq,
  getReturnPolicy,
  sendContactMessage,
} from '@/api/endpoints/content';
import { etagQuery, selectData } from '@/api/etag-query';
import { queryKeys } from '@/api/query-keys';
import type { ContactMessageRequest } from '@/contracts/mobile/shop/v1';
import { useLocale } from '@/i18n/locale-store';

/** A page the merchant writes: `privacy`, `terms`, `cookies`, `accessibility`, or one of their own. */
export function useContentPage(handle: string) {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.contentPage(locale, handle),
    queryFn: etagQuery((options) => getContentPage(locale, handle, options)),
    select: selectData,
  });
}

export function useFaq() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.faq(locale),
    queryFn: etagQuery((options) => getFaq(locale, options)),
    select: selectData,
  });
}

/** The store's About page: its story, figures, team and reviews. */
export function useAboutPage() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.aboutPage(locale),
    queryFn: etagQuery((options) => getAboutPage(locale, options)),
    select: selectData,
  });
}

/** The store's Contact page: its address, email, phone, hours and profiles. */
export function useContactPage() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.contactPage(locale),
    queryFn: etagQuery((options) => getContactPage(locale, options)),
    select: selectData,
  });
}

/** The store's return policy, the website's /returns. */
export function useReturnPolicy() {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.returnPolicy(locale),
    queryFn: etagQuery((options) => getReturnPolicy(locale, options)),
    select: selectData,
  });
}

/**
 * Sends the contact form. A retry of the same message goes with the same
 * `Idempotency-Key`, so the store gets it once; a changed message is a new one.
 * A signed-in shopper's message starts a conversation in their inbox, so the
 * inbox is fetched again.
 */
export function useSendContactMessage(makeKey: () => string = randomUUID) {
  const locale = useLocale();
  const client = useQueryClient();
  const attempt = useRef<{ body: string; key: string } | null>(null);

  return useMutation({
    mutationFn: (body: ContactMessageRequest) => {
      const json = JSON.stringify(body);
      if (attempt.current?.body !== json) attempt.current = { body: json, key: makeKey() };
      return sendContactMessage(locale, body, attempt.current.key);
    },
    onSuccess: (result) => {
      attempt.current = null;
      if (result.conversationId) {
        void client.invalidateQueries({ queryKey: queryKeys.chatConversations(locale) });
      }
    },
  });
}

/** How many articles a page of the blog asks for. */
const BLOG_PAGE_SIZE = 20;

/**
 * The blog, a page at a time, narrowed to a category or a tag as the website's
 * links narrow it. The categories come with every page; the first page's are kept.
 */
export function useBlogArticles(filter: { category?: string; tag?: string }) {
  const locale = useLocale();
  const query = {
    limit: BLOG_PAGE_SIZE,
    ...(filter.category ? { category: filter.category } : {}),
    ...(filter.tag ? { tag: filter.tag } : {}),
  };

  return useInfiniteQuery({
    queryKey: queryKeys.blogArticles(locale, query),
    queryFn: ({ pageParam, signal }) =>
      getBlogArticles(locale, { ...query, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    select: (data) => ({
      articles: data.pages.flatMap((page) => page.items),
      categories: data.pages[0]?.categories ?? [],
    }),
  });
}

export function useBlogArticle(slug: string) {
  const locale = useLocale();
  return useQuery({
    queryKey: queryKeys.blogArticle(locale, slug),
    queryFn: etagQuery((options) => getBlogArticle(locale, slug, options)),
    select: selectData,
  });
}

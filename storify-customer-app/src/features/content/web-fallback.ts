import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { isApiError } from '@/api/errors';
import { useConfig } from '@/features/config/use-config';
import { joinWebsiteUrl } from '@/lib/links';

/**
 * Whether only the website can show this page, so the app opens it there:
 *
 * - the store is older than these screens and has no such endpoint
 *   (ROUTE_NOT_FOUND, or a 404 that is not the API's own answer);
 * - the page exists but is built from the website's sections (WEB_ONLY).
 *
 * A page that is hidden or gone is a plain NOT_FOUND: the website has nothing
 * to show either, and the screen says so itself.
 */
export function opensOnWebsite(error: unknown): boolean {
  if (!isApiError(error) || error.status !== 404) return false;
  if (error.code === 'NOT_FOUND') return error.reason === 'WEB_ONLY';
  return error.code !== 'LOCALE_NOT_AVAILABLE';
}

/** A page or an article the store does not have, or no longer shows. */
export function isGone(error: unknown): boolean {
  return isApiError(error) && error.status === 404 && !opensOnWebsite(error);
}

/**
 * Puts the website's page at `path` in place of this screen when only the
 * website can show it (`opensOnWebsite`), so a store that is not updated yet
 * still opens the page inside the app. True while it does: show the screen's
 * loading state meanwhile.
 */
export function useWebFallback(path: string, error: unknown, title?: string): boolean {
  const router = useRouter();
  const website = useConfig().data?.store.websiteUrl;
  const fallback = Boolean(website) && opensOnWebsite(error);

  useEffect(() => {
    if (!fallback || !website) return;
    const url = joinWebsiteUrl(website, path);
    router.replace({ pathname: '/web', params: title ? { url, title } : { url } });
  }, [fallback, website, path, title, router]);

  return fallback;
}

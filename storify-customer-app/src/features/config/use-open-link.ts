import { useRouter, type Href } from 'expo-router';

import { useOpenPage } from '@/features/web/use-open-page';
import { joinWebsiteUrl, resolveAppLink } from '@/lib/links';

import { useConfig } from './use-config';

/**
 * Follows a link the store sent (the target of a banner, of "View all", of a
 * notification). The link is a path of the storefront on the web: it opens as a
 * screen when the app has one for that path, and as a web page inside the app
 * when it has not: the shopper never leaves the app.
 */
export function useOpenLink(): (href: string) => void {
  const router = useRouter();
  const website = useConfig().data?.store.websiteUrl;
  const openPage = useOpenPage();

  return (href) => {
    const path = resolveAppLink(href);
    if (path) {
      // Checked against the app's own list of paths just above.
      router.push(path as Href);
      return;
    }

    const url = /^https?:\/\//i.test(href) ? href : website ? joinWebsiteUrl(website, href) : null;
    if (url) openPage(url);
  };
}

import { APP_LINK_PATTERNS } from '@/contracts/mobile/shop/v1';
import { BUNDLED_LOCALES } from '@/i18n/locales';

/**
 * Links that arrive from outside the app: a universal link, a push
 * notification, the target of a home block. All of them are addresses of the
 * storefront on the web, and the app's screens use the same paths as the
 * website, so turning one into a screen takes two steps: drop the site's
 * address and the language in front, then see whether the app has that path.
 */

const LOCALE_PREFIX = new RegExp(`^/(${BUNDLED_LOCALES.join('|')})(?=/|\\?|$)`, 'i');

/**
 * `https://shop.example.com/bn/products/red-shoe?ref=push` → `/products/red-shoe?ref=push`
 * `storify://products/red-shoe` → `/products/red-shoe`
 */
export function toAppPath(input: string): string {
  let path = input.trim();

  const url = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/i.exec(path);
  if (url) {
    const [, scheme = '', host = '', rest = ''] = url;
    // After `https://` comes a host. After the app's own scheme comes the path itself.
    path = /^https?$/i.test(scheme) ? rest : `/${host}${rest}`;
  }

  path = `/${path}`.replace(/^\/+/, '/').replace(/#.*$/, '');
  path = path.replace(LOCALE_PREFIX, '');
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * `/products/:slug` → `^/products/[^/]+/?$`. A `:name` is one path segment; the
 * rest of a pattern is taken letter for letter.
 */
const toMatcher = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern
      .split('/')
      .map((segment) =>
        segment.startsWith(':') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      )
      .join('/')}/?$`
  );

const MATCHERS = APP_LINK_PATTERNS.map(toMatcher);

/**
 * Website pages whose screen in the app lives at another path: "Become a
 * vendor" is the app's screen about the Storify Business app.
 */
const APP_ALIASES: Readonly<Record<string, string>> = { '/become-vendor': '/sell' };

/**
 * The screen a web address opens, or `null` when the app has no screen for it
 * and the address should open in a browser instead. Every path in the
 * contract's link table is a route of the app, the same path as on the website.
 */
export function resolveAppLink(input: string): string | null {
  const path = toAppPath(input);
  const pathname = path.split('?')[0] ?? path;
  const alias = APP_ALIASES[pathname.replace(/\/$/, '')];
  if (alias) return alias;
  return MATCHERS.some((matcher) => matcher.test(pathname)) ? path : null;
}

/**
 * An address on the store's website. `websiteUrl` ends with a slash and a link
 * starts with one, so putting them side by side would make a `//`.
 *
 * `https://shop.example.com/` + `/account/orders/7` → `https://shop.example.com/account/orders/7`
 */
export function joinWebsiteUrl(website: string, path: string): string {
  return `${website.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

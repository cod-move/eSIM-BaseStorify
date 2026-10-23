/**
 * The in-app web page's address parameters. Anybody can write a link to the
 * screen, so only an http or https address is opened.
 */
export function readPageUrl(value: string | string[] | undefined): string | null {
  const url = Array.isArray(value) ? value[0] : value;
  if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) return null;
  return url;
}

/** The scheme and host of an address, lower-cased: `https://shop.test`. */
function originOf(url: string): string {
  return (/^https?:\/\/[^/?#]+/i.exec(url)?.[0] ?? '').toLowerCase();
}

/**
 * The header's title: the one the link gave; else the store's name for a page
 * of its own website (its dashboard); else the page's host.
 */
export function pageTitle(
  url: string | null,
  title: string | string[] | undefined,
  store?: { name: string; websiteUrl: string }
): string {
  const given = (Array.isArray(title) ? title[0] : title)?.trim();
  if (given) return given;
  if (!url) return '';
  if (store && originOf(url) === originOf(store.websiteUrl)) return store.name;
  return url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0] ?? '';
}

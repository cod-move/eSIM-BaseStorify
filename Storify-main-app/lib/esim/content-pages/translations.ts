/**
 * Per-language versions of the policy pages (privacy, terms, cookies,
 * accessibility). The page's own title and content stay the store's default
 * version; `translations[locale]` holds another language's. A language with
 * no content of its own shows the default version, so a store can add
 * languages one at a time. Used on the server (pages, app API) and in the
 * admin editor, so nothing here is server-only.
 */

export type ContentPageTranslation = { title: string; content: string };
export type ContentPageTranslations = Record<string, ContentPageTranslation>;

const LOCALE_KEY = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

/** Rich-text content with no visible text counts as not filled in. */
export function hasPageContent(html: string | undefined): boolean {
  if (!html) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

/** Keeps well-formed entries only; drops languages left empty. */
export function normalizeContentPageTranslations(value: unknown): ContentPageTranslations {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ContentPageTranslations = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const locale = key.toLowerCase();
    if (!LOCALE_KEY.test(locale) || !raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const content = typeof entry.content === "string" ? entry.content : "";
    if (!title && !hasPageContent(content)) continue;
    out[locale] = { title, content };
  }
  return out;
}

/** The title and content to show in `locale`, falling back to the default version. */
export function localizeContentPage(
  page: { title: string; content: string; translations?: ContentPageTranslations },
  locale: string | undefined,
): ContentPageTranslation {
  const entry = locale ? page.translations?.[locale.toLowerCase()] : undefined;
  if (!entry || !hasPageContent(entry.content)) {
    return { title: page.title, content: page.content };
  }
  return { title: entry.title || page.title, content: entry.content };
}

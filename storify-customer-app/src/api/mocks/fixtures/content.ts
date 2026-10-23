/**
 * The mock store's data for: its own pages (privacy, terms, a page of its
 * own …), its FAQ and its blog. The blog's first articles are the ones the
 * home's article block shows (`articleListBlock`), so a card opens its article;
 * the rest fill the list past one page.
 */
import type {
  BlogArticle,
  BlogArticleCategory,
  BlogArticleSummary,
  ContentPage,
  FaqPage,
} from '@/contracts/mobile/shop/v1';

import { articleListBlock } from './home-story-blocks';
import { picture } from './shared';

const PAGES: Record<string, ContentPage> = {
  privacy: {
    handle: 'privacy',
    title: 'Privacy policy',
    html: '<h2>What we keep</h2><p>Your name, your addresses and your orders, for as long as you have an account.</p><h2>Who sees it</h2><ul><li>The couriers who deliver your orders</li><li>Our payment partners, for the payment only</li></ul><p>Questions? See <a href="/faq">our FAQ</a>, or write to <a href="mailto:privacy@example.com">privacy@example.com</a>.</p>',
  },
  terms: {
    handle: 'terms',
    title: 'Terms of service',
    html: '<h2>Orders</h2><p>An order is a contract once the store confirms it.</p><h2>Prices</h2><p>Prices include tax where the law asks for it.</p>',
  },
  accessibility: {
    handle: 'accessibility',
    title: 'Accessibility',
    html: '<p>We want everybody to be able to shop here. Tell us when something is hard to use.</p>',
  },
  shipping: {
    handle: 'shipping',
    title: 'Shipping',
    html: '<p>Orders leave the warehouse within two working days.</p><img src="https://picsum.photos/seed/shipping/1080/608" alt="Parcels on a shelf" width="1080" height="608">',
    updatedAt: '2026-09-20T08:00:00Z',
  },
};

/** A page the mock store's theme builds from sections: only the website shows it. */
const LANDING_PAGES = new Set(['summer-sale']);

/** The page, `'web-only'` for a landing page, `null` for none (or a hidden one: the cookie policy). */
export function findContentPage(handle: string): ContentPage | 'web-only' | null {
  if (LANDING_PAGES.has(handle)) return 'web-only';
  return PAGES[handle] ?? null;
}

export const faqPage: FaqPage = {
  title: 'Frequently asked questions',
  subtitle: 'Quick answers about orders, delivery and returns.',
  items: [
    {
      id: 'faq-shipping',
      question: 'How long does shipping take?',
      answer: 'Standard shipping takes 3 to 7 working days.',
    },
    {
      id: 'faq-returns',
      question: 'What is your return policy?',
      answer:
        'You can return items within 30 days of delivery.\nThey must be unused and in their box.',
    },
  ],
};

const CATEGORIES: BlogArticleCategory[] = [
  { slug: 'guides', name: 'Guides' },
  { slug: 'home', name: 'Home' },
];

/** Enough articles that the list takes more than one page of the default size. */
const FILLER_COUNT = 24;

type MockArticle = BlogArticleSummary & { category: string; tags: string[] };

const ARTICLES: MockArticle[] = [
  ...articleListBlock.articles.map(({ href: _href, ...article }, index) => ({
    ...article,
    category: index === 2 ? 'home' : 'guides',
    tags: index === 0 ? ['bags', 'travel'] : ['tech'],
  })),
  ...Array.from({ length: FILLER_COUNT }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return {
      id: `article-${number}`,
      slug: `notes-${number}`,
      title: `Shop notes ${number}`,
      excerpt: 'What we learned this week.',
      authorName: 'Mira Hasan',
      publishedAt: `2026-08-${String(28 - index).padStart(2, '0')}T09:00:00Z`,
      category: 'home',
      tags: ['notes'],
    };
  }),
];

const summaryOf = ({ category: _category, tags: _tags, ...summary }: MockArticle) => summary;

export function listBlogArticles(filter: { category?: string; tag?: string }): {
  items: BlogArticleSummary[];
  categories: BlogArticleCategory[];
} {
  const items = ARTICLES.filter(
    (article) =>
      (!filter.category ||
        !CATEGORIES.some((category) => category.slug === filter.category) ||
        article.category === filter.category) &&
      (!filter.tag || article.tags.includes(filter.tag))
  ).map(summaryOf);
  return { items, categories: CATEGORIES };
}

export function findBlogArticle(slug: string): BlogArticle | null {
  const article = ARTICLES.find((item) => item.slug === slug);
  if (!article) return null;
  return {
    ...summaryOf(article),
    html: `<p>${article.excerpt ?? article.title}</p><h2>Start small</h2><p>Pick <strong>one</strong> thing and keep it. Our <a href="/products">whole range</a> is a good place to look.</p><ul><li>Choose what you use daily</li><li>Leave the rest at home</li></ul><img src="https://picsum.photos/seed/${article.slug}-body/1080/720" alt="A tidy shelf" width="1080" height="720">`,
    authorImage: picture('author-mira', article.authorName ?? ''),
    readingMinutes: 4,
    categories: CATEGORIES.filter((category) => category.slug === article.category),
    tags: article.tags,
    related: ARTICLES.filter((item) => item.slug !== slug && item.category === article.category)
      .slice(0, 3)
      .map(summaryOf),
  };
}

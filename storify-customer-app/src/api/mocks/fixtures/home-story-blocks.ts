/** The mock Home's story blocks, spread into `homeBlocks` (home.ts): articles, testimonials, a look, a row of looks and a category mosaic. */
import type {
  ArticleListBlock,
  CategoryMosaicBlock,
  LookBlock,
  LookListBlock,
  RawHomeBlock,
  TestimonialsBlock,
} from '@/contracts/mobile/shop/v1';

import { listProducts } from './products';
import { picture } from './shared';

export const articleListBlock: ArticleListBlock = {
  type: 'ARTICLE_LIST',
  id: 'journal',
  title: 'From the journal',
  articles: [
    {
      id: 'article-carry',
      slug: 'what-to-carry-every-day',
      title: 'What to carry every day',
      excerpt: 'Five things that earn their place in a bag, and three that never did.',
      image: picture('article-carry', 'A bag laid out with its contents', 16 / 9),
      authorName: 'Mira Hasan',
      publishedAt: '2026-09-18T09:00:00Z',
      href: '/blog/what-to-carry-every-day',
    },
    {
      id: 'article-sound',
      slug: 'choosing-earbuds',
      title: 'Choosing earbuds you will actually wear',
      excerpt: 'Fit, battery and sound, in the order that matters on a commute.',
      image: picture('article-sound', 'Earbuds in their case', 16 / 9),
      authorName: 'Tarek Aziz',
      publishedAt: '2026-09-02T09:00:00Z',
      href: '/blog/choosing-earbuds',
    },
    {
      id: 'article-home',
      slug: 'a-calmer-desk',
      title: 'A calmer desk in ten minutes',
      authorName: 'Mira Hasan',
      href: '/blog/a-calmer-desk',
    },
  ],
};

export const testimonialsBlock: TestimonialsBlock = {
  type: 'TESTIMONIALS',
  id: 'testimonials',
  title: 'What shoppers say',
  testimonials: [
    {
      id: 'testimonial-1',
      rating: 5,
      title: 'Exactly as described',
      comment: 'It arrived in two days, well packed, and the quality is better than the photos.',
      reviewerName: 'Nadia R.',
    },
    {
      id: 'testimonial-2',
      rating: 4.5,
      title: 'Great value',
      comment: 'I use it every day. The strap is a little stiff at first but it softens.',
      reviewerName: 'Imran K.',
    },
    {
      id: 'testimonial-3',
      rating: 4,
      comment: 'Good price and fast support when I needed a different size.',
    },
  ],
};

const lookProducts = listProducts('en')
  .slice(0, 3)
  .map(({ category: _category, ...card }) => card);

export const lookBlock: LookBlock = {
  type: 'LOOK',
  id: 'look',
  title: 'Weekend look',
  subtitle: 'Three pieces that go together',
  look: { slug: 'weekend', title: 'Weekend' },
  image: picture('look-weekend', 'A weekend outfit', 4 / 5),
  imagePosition: 'START',
  products: lookProducts,
  ctaLabel: 'Add all to cart',
};

export const lookListBlock: LookListBlock = {
  type: 'LOOK_LIST',
  id: 'looks',
  title: 'Shop the looks',
  aspectRatio: 3 / 4,
  looks: [
    {
      id: 'look-weekend',
      slug: 'weekend',
      title: 'Weekend',
      image: picture('looks-weekend', 'Weekend', 3 / 4),
    },
    {
      id: 'look-office',
      slug: 'office',
      title: 'Office',
      image: picture('looks-office', 'Office', 3 / 4),
    },
    {
      id: 'look-travel',
      slug: 'travel',
      title: 'Travel',
      image: picture('looks-travel', 'Travel', 3 / 4),
    },
  ],
};

export const categoryMosaicBlock: CategoryMosaicBlock = {
  type: 'CATEGORY_MOSAIC',
  id: 'mosaic',
  title: 'Explore',
  categories: [
    {
      id: 'mosaic-electronics',
      slug: 'electronics',
      name: 'Electronics',
      image: picture('mosaic-electronics', 'Electronics', 1),
    },
    { id: 'mosaic-bags', slug: 'bags', name: 'Bags', image: picture('mosaic-bags', 'Bags', 1) },
    {
      id: 'mosaic-shoes',
      slug: 'shoes',
      name: 'Shoes',
      image: picture('mosaic-shoes', 'Shoes', 1),
    },
    { id: 'mosaic-home', slug: 'home', name: 'Home', image: picture('mosaic-home', 'Home', 1) },
    {
      id: 'mosaic-clothing',
      slug: 'clothing',
      name: 'Clothing',
      image: picture('mosaic-clothing', 'Clothing', 1),
    },
  ],
};

export const homeStoryBlocks: RawHomeBlock[] = [
  articleListBlock,
  testimonialsBlock,
  lookBlock,
  lookListBlock,
  categoryMosaicBlock,
];

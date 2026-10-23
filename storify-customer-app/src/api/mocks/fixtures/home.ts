/**
 * The mock store's home page, as `GET /home` sends it, made from the
 * catalogue. The blocks follow the design's first home (Home 1): the hero
 * carousel with the departments over it, the category grid, the showcase
 * panels, brands, the featured rail, the banner, the latest grid, the coupon
 * and the tabbed shelves.
 */
import type { Gradient, RawHomeBlock } from '@/contracts/mobile/shop/v1';

import { categoryScope, categoryTree } from './categories';
import { homeContentBlocks } from './home-content-blocks';
import { homeStoryBlocks } from './home-story-blocks';
import { listProducts } from './products';
import { picture } from './shared';

const linear = (from: string, to: string, angle = 135): Gradient => ({
  kind: 'LINEAR',
  angle,
  stops: [
    { color: from, at: 0 },
    { color: to, at: 100 },
  ],
});

export function homeBlocks(locale: string): RawHomeBlock[] {
  const products = listProducts(locale);
  const cards = (filter: (product: (typeof products)[number]) => boolean) =>
    products.filter(filter).map(({ category: _category, ...card }) => card);
  const inCategory = (slug: string) =>
    cards((product) => categoryScope([slug]).has(product.category));

  return [
    {
      type: 'SLIDESHOW',
      id: 'hero',
      aspectRatio: 295 / 142,
      // Painted slides: the words are text the app draws, the picture is a cut-out.
      slides: [
        {
          id: 'slide-1',
          imageFit: 'STRETCH',
          background: { gradient: linear('#1e3a8a', '#4338ca') },
          artwork: picture('slide-earbuds', 'Wireless earbuds', 1),
          tagline: 'New season',
          heading: 'Sound that\nfollows you',
          textColor: '#ffffff',
          align: { horizontal: 'START', vertical: 'CENTER' },
          cta: { label: 'Shop now', href: '/products?category=electronics' },
        },
        {
          id: 'slide-2',
          href: '/products?onSale=true',
          imageFit: 'STRETCH',
          background: { color: '#fde68a' },
          artwork: picture('slide-bags', 'Bags', 1),
          heading: 'Bags for\nevery day',
          textColor: '#1f2937',
          align: { horizontal: 'START', vertical: 'CENTER' },
          // No link of its own: the button takes the slide's.
          cta: { label: 'Shop the sale' },
        },
        {
          id: 'slide-3',
          href: '/products',
          image: picture('slide-summer', 'New season', 295 / 142),
          imageFit: 'COVER',
          background: { overlay: 0.3 },
        },
      ],
      showsCategories: true,
    },
    {
      type: 'CATEGORY_LIST',
      id: 'categories',
      title: 'Shop by category',
      categories: categoryTree().map(({ children: _children, ...category }) => category),
      layout: 'CIRCLES',
    },
    {
      type: 'COLLECTION_ROWS',
      id: 'showcase',
      rows: [
        {
          id: 'showcase-electronics',
          collection: { slug: 'electronics', title: 'Electronics' },
          href: '/collections/electronics',
          panel: {
            aspectRatio: 1.243,
            slides: [
              {
                id: 'panel-electronics',
                imageFit: 'STRETCH',
                background: { gradient: linear('#0f172a', '#334155', 180) },
                artwork: picture('panel-headphones', 'Headphones', 1),
                heading: 'Electronics',
                textColor: '#ffffff',
                align: { horizontal: 'START', vertical: 'START' },
                // Without a link, the button opens the collection.
                cta: { label: 'Shop now' },
              },
            ],
          },
          products: inCategory('electronics'),
        },
        {
          id: 'showcase-bags',
          collection: { slug: 'bags', title: 'Bags' },
          href: '/collections/bags',
          panel: {
            aspectRatio: 1.243,
            slides: [
              {
                id: 'panel-bags',
                imageFit: 'STRETCH',
                background: { gradient: linear('#fef3c7', '#fcd34d', 180) },
                artwork: picture('panel-backpack', 'Backpack', 1),
                heading: 'Bags',
                textColor: '#1f2937',
                align: { horizontal: 'START', vertical: 'START' },
                cta: { label: 'Shop now' },
              },
            ],
          },
          products: inCategory('bags'),
        },
      ],
    },
    {
      type: 'BRAND_LIST',
      id: 'brands',
      layout: 'CARDS',
      brands: ['northwind', 'fieldstone', 'lumen'].map((slug) => ({
        id: `brand-${slug}`,
        slug,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        logo: picture(`brand-${slug}`, slug, 1),
        href: `/products?brand=${slug}`,
      })),
    },
    {
      type: 'PRODUCT_RAIL',
      id: 'featured',
      title: 'Featured',
      products: cards(() => true),
      href: '/products',
    },
    {
      type: 'SPONSORED_RAIL',
      id: 'sponsored',
      title: 'Sponsored',
      products: cards((product) => product.sponsored !== undefined),
    },
    // A kind of block this app version does not know: it must be skipped, not crash.
    { type: 'HOLOGRAM_SHOWCASE', id: 'hologram', scenes: [] },
    {
      type: 'BANNER',
      id: 'banner-bags',
      aspectRatio: 16 / 7,
      imageFit: 'STRETCH',
      background: { gradient: linear('#111827', '#4b5563', 90) },
      artwork: picture('banner-backpack', 'Commuter backpack', 1),
      heading: 'Commuter backpack',
      description: 'Room for a laptop and a day out.',
      textColor: '#ffffff',
      align: { horizontal: 'START', vertical: 'CENTER' },
      cta: { label: 'Shop now', href: '/products/commuter-backpack-22l' },
    },
    {
      type: 'PRODUCT_GRID',
      id: 'latest',
      title: 'Latest',
      products: cards(() => true).slice(0, 6),
    },
    {
      type: 'COUPON',
      id: 'coupon',
      code: 'WELCOME10',
      offer: '10% off your first order',
      image: picture('coupon', 'Coupon', 4),
    },
    {
      type: 'PRODUCT_TABS',
      id: 'shelves',
      tabs: [
        { id: 'new', label: 'New', products: cards(() => true).slice(0, 6) },
        {
          id: 'sale',
          label: 'On sale',
          products: cards((product) => product.compareAtPrice !== undefined),
        },
        { id: 'clothing', label: 'Clothing', products: inCategory('clothing') },
      ],
    },
    ...homeContentBlocks,
    ...homeStoryBlocks,
  ];
}

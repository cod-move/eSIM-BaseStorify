import { View } from 'react-native';

import type { ImageSet, Money, ProductCard as ProductCardData } from '@/contracts/mobile/shop/v1';
import { ProductCard, type ProductCardVariant } from '@/features/catalog/product-card';
import { SellerTile } from '@/features/catalog/seller-tile';

import { GalleryItem, GalleryPage, GallerySection } from './gallery-kit';

/**
 * The product cards of `src/features/catalog` in every variant and with every
 * flag the store can set. Names and prices are made up here the way the store
 * sends them: formatted already, because the app never formats money.
 */
const usd = (amount: number, formatted: string): Money => ({ amount, currency: 'USD', formatted });

const photo = (seed: string, alt: string): ImageSet => {
  const url = (width: number) => `https://picsum.photos/seed/${seed}/${width}/${width}`;
  return { thumb: url(256), card: url(640), full: url(1080), alt };
};

type Extra = Partial<Omit<ProductCardData, 'price'>> & { price?: Money | null };

function product(id: string, name: string, extra: Extra = {}): ProductCardData {
  const { price = usd(24, '$24.00'), ...rest } = extra;
  return {
    id,
    slug: id,
    name,
    image: photo(id, name),
    ...(price ? { price } : {}),
    priceVaries: false,
    rating: { average: 4.5, count: 120 },
    availability: 'IN_STOCK',
    requiresVariantChoice: false,
    priceOnRequest: false,
    isDigital: false,
    purchasableInApp: true,
    ...rest,
  };
}

type Case = { label: string; product: ProductCardData; wishlisted?: boolean; busy?: boolean };

const CASES: Case[] = [
  { label: 'In stock, adds at once', product: product('tee', 'Everyday cotton tee') },
  {
    label: 'Compare-at price',
    product: product('bag', 'Canvas weekender bag', {
      price: usd(89, '$89.00'),
      compareAtPrice: usd(120, '$120.00'),
    }),
  },
  {
    label: '"From" price',
    product: product('lamp', 'Desk lamp', { price: usd(18, '$18.00'), priceVaries: true }),
  },
  {
    label: 'Needs options',
    product: product('shoes', 'Trail running shoes', {
      price: usd(129, '$129.00'),
      requiresVariantChoice: true,
    }),
  },
  {
    label: 'Sponsored',
    product: product('mug', 'Stoneware mug', { sponsored: { campaignId: 'c1' } }),
  },
  {
    label: 'Out of stock',
    product: product('kettle', 'Gooseneck kettle', { availability: 'OUT_OF_STOCK' }),
  },
  {
    label: 'Pre-order',
    product: product('speaker', 'Portable speaker', { availability: 'PRE_ORDER' }),
  },
  {
    label: 'Sponsored and out of stock',
    product: product('pan', 'Cast iron pan', {
      availability: 'OUT_OF_STOCK',
      sponsored: { campaignId: 'c2' },
    }),
  },
  {
    label: 'Price on request',
    product: product('sofa', 'Three-seat linen sofa', { price: null, priceOnRequest: true }),
  },
  {
    label: 'Not buyable in the app',
    product: product('course', 'Photography course', { isDigital: true, purchasableInApp: false }),
  },
  { label: 'No rating', product: product('plant', 'Snake plant', { rating: undefined }) },
  {
    label: 'No picture',
    product: product('blank', 'Product without a picture', { image: undefined }),
  },
  {
    label: 'Long name',
    product: product(
      'jacket',
      'Lightweight waterproof trail running jacket with taped seams and a packable hood'
    ),
  },
  { label: 'In the wishlist', product: product('scarf', 'Wool scarf'), wishlisted: true },
  { label: 'Adding to the cart', product: product('cap', 'Canvas cap'), busy: true },
];

const SELLER = {
  name: 'North Trail',
  logo: photo('north-trail', 'North Trail'),
  rating: { average: 4.6, count: 350 },
};

const noop = () => undefined;

/** How wide each variant's cell is, so the page shows the variant as a screen would. */
const CELLS: Record<ProductCardVariant, string> = {
  grid: 'w-[48%]',
  compact: 'w-[31%]',
  rail: 'w-[130px]',
  plain: 'w-[130px]',
  row: 'w-full',
};

const VARIANTS: { variant: ProductCardVariant; title: string }[] = [
  { variant: 'grid', title: 'Grid card (lists, Latest, Wishlist)' },
  { variant: 'compact', title: 'Compact card (showcase panels, three across)' },
  { variant: 'rail', title: 'Rail card (shelves)' },
  { variant: 'plain', title: 'Plain card (tabbed shelves)' },
  { variant: 'row', title: 'Result row (search, tracking, reviews)' },
];

export function CardsGallery() {
  return (
    <GalleryPage>
      {VARIANTS.map(({ variant, title }) => (
        <GallerySection key={variant} title={title}>
          <View
            className={
              variant === 'rail' || variant === 'plain'
                ? 'flex-row flex-wrap gap-3'
                : 'flex-row flex-wrap justify-between gap-y-4'
            }>
            {CASES.map((item) => (
              <View key={item.label} className={CELLS[variant]}>
                <GalleryItem label={item.label}>
                  <ProductCard
                    product={item.product}
                    variant={variant}
                    onPress={noop}
                    onAddToCart={noop}
                    onToggleWishlist={noop}
                    isWishlisted={item.wishlisted}
                    busy={item.busy}
                  />
                </GalleryItem>
              </View>
            ))}
          </View>
        </GallerySection>
      ))}

      <GallerySection title="Seller tile">
        <GalleryItem label="Logo, name, reviews">
          <SellerTile vendor={SELLER} onPress={noop} />
        </GalleryItem>
        <GalleryItem label="Single shop: logo and name only">
          <SellerTile vendor={{ name: SELLER.name, logo: SELLER.logo }} />
        </GalleryItem>
        <GalleryItem label="No logo yet">
          <SellerTile vendor={{ name: 'New Seller', rating: SELLER.rating }} onPress={noop} />
        </GalleryItem>
      </GallerySection>
    </GalleryPage>
  );
}

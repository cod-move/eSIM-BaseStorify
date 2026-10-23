import type { ComponentType } from 'react';

import type { HomeBlock } from '@/contracts/mobile/shop/v1';

import { ArticleList } from './article-list';
import { Banner } from './banner';
import { Benefits } from './benefits';
import { BrandList } from './brand-list';
import { CategoryList } from './category-list';
import { CategoryMosaic } from './category-mosaic';
import { CollectionList } from './collection-list';
import { CollectionRows } from './collection-rows';
import { Countdown } from './countdown';
import { Coupon } from './coupon';
import { Faq } from './faq';
import { Heading } from './heading';
import { ImageGallery } from './image-gallery';
import { ImageText } from './image-text';
import { Look } from './look';
import { LookList } from './look-list';
import { ProductGrid } from './product-grid';
import { ProductRail } from './product-rail';
import { ProductTabs } from './product-tabs';
import { PromotionGrid } from './promotion-grid';
import { RichText } from './rich-text';
import { SellerInvite } from './seller-invite';
import { Slideshow } from './slideshow';
import { Spacer } from './spacer';
import { SponsoredRail } from './sponsored-rail';
import { Testimonials } from './testimonials';
import { VendorList } from './vendor-list';

type BlockViews = {
  [K in HomeBlock['type']]: ComponentType<{ block: Extract<HomeBlock, { type: K }> }>;
};

/**
 * The kinds whose component draws nothing yet on a phone. Home leaves them out, so they add no
 * gap; take a kind out of here when its component starts drawing.
 */
export const UNDRAWN_BLOCKS: ReadonlySet<HomeBlock['type']> = new Set(['COLLECTION_LIST']);

/**
 * What draws each kind of block. TypeScript refuses to compile until every kind
 * in the contract (`HOME_BLOCKS`) has a component, in a file of its own here.
 */
export const HOME_BLOCK_VIEWS: BlockViews = {
  SLIDESHOW: Slideshow,
  PROMOTION_GRID: PromotionGrid,
  BANNER: Banner,
  CATEGORY_LIST: CategoryList,
  CATEGORY_MOSAIC: CategoryMosaic,
  PRODUCT_RAIL: ProductRail,
  SPONSORED_RAIL: SponsoredRail,
  PRODUCT_GRID: ProductGrid,
  PRODUCT_TABS: ProductTabs,
  COLLECTION_ROWS: CollectionRows,
  COLLECTION_LIST: CollectionList,
  BRAND_LIST: BrandList,
  VENDOR_LIST: VendorList,
  COUNTDOWN: Countdown,
  COUPON: Coupon,
  LOOK: Look,
  LOOK_LIST: LookList,
  RICH_TEXT: RichText,
  IMAGE_TEXT: ImageText,
  HEADING: Heading,
  SPACER: Spacer,
  IMAGE_GALLERY: ImageGallery,
  ARTICLE_LIST: ArticleList,
  TESTIMONIALS: Testimonials,
  BENEFITS: Benefits,
  FAQ: Faq,
  SELLER_INVITE: SellerInvite,
};

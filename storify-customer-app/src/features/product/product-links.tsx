import { router, type Href } from 'expo-router';
import { Share, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { ActionTile } from '@/components/ui/action-tile';
import { CompactRating } from '@/components/ui/rating';
import { NavRow, RowGroup } from '@/components/ui/rows';
import type { ProductDetail } from '@/contracts/mobile/shop/v1';

type Sheet = 'description' | 'specification' | 'reviews';

/**
 * The sheets of the product page open as routes under the product's path, so
 * a link from the website opens the same sheet.
 */
function sheetHref(slug: string, sheet: Sheet): Href {
  return `/products/${encodeURIComponent(slug)}/${sheet}`;
}

/** The share button: the phone's own share sheet, with the product's page on the web. */
export function ShareButton({ product }: { product: ProductDetail }) {
  const t = useTranslations('product');

  return (
    <ActionTile
      icon="share"
      label={t('share')}
      onPress={() =>
        void Share.share({
          title: product.name,
          message: `${product.name}\n${product.shareUrl}`,
          url: product.shareUrl,
        })
      }
    />
  );
}

/** The rows that open the Description, Specification and Reviews sheets. */
export function SheetRows({ product, reviews }: { product: ProductDetail; reviews: boolean }) {
  const t = useTranslations('product');
  const tCatalog = useTranslations('catalog');
  const format = useFormatter();
  const open = (sheet: Sheet) => router.push(sheetHref(product.slug, sheet));

  return (
    <View>
      <RowGroup card={false}>
        {product.descriptionHtml ? (
          <NavRow key="description" title={t('description')} onPress={() => open('description')} />
        ) : null}
        {product.attributes.length > 0 ? (
          <NavRow
            key="specification"
            title={t('specification')}
            onPress={() => open('specification')}
          />
        ) : null}
        {reviews ? (
          <NavRow
            key="reviews"
            title={t('reviewsRow')}
            value={product.rating ? <CompactRating rating={product.rating} showCount /> : undefined}
            valueLabel={
              product.rating
                ? tCatalog('ratingLabel', {
                    average: format.number(product.rating.average, { maximumFractionDigits: 1 }),
                    count: product.rating.count,
                  })
                : undefined
            }
            onPress={() => open('reviews')}
          />
        ) : null}
      </RowGroup>
    </View>
  );
}

/** Opens the Reviews sheet: the rating under the name leads there. */
export function openReviews(slug: string) {
  router.push(sheetHref(slug, 'reviews'));
}

import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';

import { QuickTile } from '../account-parts';

/** The quick tile to the shopper's reviews, `/account/reviews`. */
export function ReviewsTile() {
  const t = useTranslations('myReviews');
  const router = useRouter();

  return (
    <QuickTile
      picture="reviews"
      label={t('tile')}
      onPress={() => router.push('/account/reviews')}
    />
  );
}

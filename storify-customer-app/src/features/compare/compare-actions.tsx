import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { ActionTile } from '@/components/ui/action-tile';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { useToast } from '@/components/ui/toast';
import { COMPARE_MAX_PRODUCTS, type ProductDetail } from '@/contracts/mobile/shop/v1';

import { useCompareState, useCompareTray } from './compare-tray';

/**
 * The product page's tile that puts the product in the comparison, or takes it
 * out. A full comparison holds no more: the tile says so instead of doing nothing.
 */
export function CompareTile({ product }: { product: Pick<ProductDetail, 'slug' | 'name'> }) {
  const t = useTranslations('compare');
  const toast = useToast();
  const toggle = useCompareTray((tray) => tray.toggle);
  const { picked, full } = useCompareState(product.slug);

  return (
    <ActionTile
      icon="scale"
      label={picked ? t('tileAdded') : t('tile')}
      accessibilityLabel={
        picked ? t('removeLabel', { name: product.name }) : t('addLabel', { name: product.name })
      }
      active={picked}
      onPress={() => {
        if (!picked && full) {
          toast.show({ message: t('full', { max: COMPARE_MAX_PRODUCTS }) });
          return;
        }
        toggle(product.slug);
      }}
    />
  );
}

/** A row on the product page that opens the comparison, once something is picked. */
export function CompareEntry() {
  const t = useTranslations('compare');
  const count = useCompareTray((tray) => tray.slugs.length);
  if (count === 0) return null;

  return (
    <View className="px-4">
      <RowGroup>
        <NavRow
          icon="scale"
          title={t('entry')}
          value={t('entryCount', { count })}
          onPress={() => router.push('/compare')}
        />
      </RowGroup>
    </View>
  );
}

import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Divider } from '@/components/ui/divider';
import { useCapability } from '@/features/config/use-capability';

import { Tile } from '../account-parts';

/**
 * The purchase tile beside Order History, to `/account/returns`, after a
 * divider of its own. It draws nothing while this release has no returns.
 */
export function ReturnsTile() {
  const t = useTranslations('returns');
  const router = useRouter();
  const available = useCapability('orders.returns');

  if (!available) return null;
  return (
    <>
      <Divider vertical className="my-4" />
      <View className="flex-1">
        <Tile
          picture="returns"
          label={t('title')}
          onPress={() => router.push('/account/returns')}
        />
      </View>
    </>
  );
}

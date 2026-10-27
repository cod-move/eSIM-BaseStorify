import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** "My eSIMs" on the Account tab, under the purchases (the eSIM module, patch P23). */
export function EsimAccountRow() {
  const t = useTranslations('esim');
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('title')}
      onPress={() => router.push('/account/esims')}
      className="min-h-14 flex-row items-center gap-3 rounded-xl bg-surface px-5 py-3 active:opacity-80">
      <Icon name="globe" size={24} />
      <Text variant="subheading" className="flex-1">
        {t('title')}
      </Text>
      <Icon name="chevron-right" size={20} directional />
    </Pressable>
  );
}

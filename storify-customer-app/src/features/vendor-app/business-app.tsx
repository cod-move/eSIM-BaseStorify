import { Linking, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { AppAsset } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { env } from '@/config/env';

/** The Storify Business app's own logo. */
const BUSINESS_LOGO = require('../../../assets/images/business-app-logo.svg') as number;

const FEATURES: { icon: IconName; key: 'list' | 'orders' | 'paid' | 'chat' }[] = [
  { icon: 'store', key: 'list' },
  { icon: 'receipt', key: 'orders' },
  { icon: 'cash', key: 'paid' },
  { icon: 'chat', key: 'chat' },
];

/**
 * "Become a vendor": selling happens in the Storify Business app, not in the
 * shopper's. What it does, and the way to its page in the phone's app store.
 */
export function BusinessApp() {
  const t = useTranslations('businessApp');
  const bottom = useBottomSpace();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      <View className="items-center gap-4 rounded-3xl bg-surface px-6 py-8">
        <AppAsset source={BUSINESS_LOGO} className="h-24 w-[86px]" />
        <Text variant="display" accessibilityRole="header" className="text-center">
          {t('title')}
        </Text>
        <Text variant="long" className="text-center text-muted">
          {t('body')}
        </Text>
      </View>

      <View className="gap-1 rounded-3xl bg-surface p-5">
        {FEATURES.map(({ icon, key }) => (
          <View key={key} className="flex-row items-start gap-4 py-3">
            <View className="size-11 items-center justify-center rounded-full bg-surface-alt">
              <Icon name={icon} size={22} />
            </View>
            <View className="flex-1 gap-0.5">
              <Text variant="subheading">{t(`features.${key}.title`)}</Text>
              <Text variant="body" className="text-muted">
                {t(`features.${key}.body`)}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View className="gap-2">
        <Button
          variant="accent"
          label={t('get')}
          accessibilityRole="link"
          onPress={() => {
            Linking.openURL(env.businessAppUrl).catch(() => undefined);
          }}
        />
        <Text variant="caption" className="text-center">
          {t('free')}
        </Text>
      </View>
    </ScrollView>
  );
}

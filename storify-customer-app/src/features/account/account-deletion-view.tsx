import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { useConfig } from '@/features/config/use-config';
import { useOpenLink } from '@/features/config/use-open-link';

/**
 * How to delete an account, for a shopper who is not signed in: the website's
 * `/account-deletion` as a screen of the app. A signed-in shopper never sees it;
 * the route sends them to the delete-account screen. The words are the
 * website's; what is the store's own (its name) comes from its settings.
 */
export function AccountDeletionView() {
  const t = useTranslations('accountDeletion');
  const router = useRouter();
  const openLink = useOpenLink();
  const storeName = useConfig().data?.store.name ?? '';

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 px-4 pb-8 pt-4">
      <View className="gap-1 px-1">
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text className="text-muted">{t('intro', { storeName })}</Text>
      </View>

      <View className="gap-3 rounded-2xl bg-surface p-5">
        <Text variant="heading" accessibilityRole="header">
          {t('inAppTitle')}
        </Text>
        <Text variant="long" className="text-muted">
          {t('inAppSteps')}
        </Text>
        <Button label={t('signIn')} onPress={() => router.push('/login')} />
      </View>

      <View className="gap-3">
        <Text variant="heading" accessibilityRole="header" className="px-1">
          {t('cannotSignInTitle')}
        </Text>
        <Text variant="long" className="px-1 text-muted">
          {t('cannotSignInReset')}
        </Text>
        <RowGroup>
          <NavRow title={t('resetAction')} onPress={() => router.push('/forgot-password')} />
        </RowGroup>
        <Text variant="long" className="px-1 text-muted">
          {t('cannotSignInContact')}
        </Text>
        <RowGroup>
          <NavRow title={t('contactAction')} onPress={() => openLink('/contact')} />
        </RowGroup>
      </View>

      <View className="gap-2 px-1">
        <Text variant="heading" accessibilityRole="header">
          {t('whatGoesTitle')}
        </Text>
        <Text variant="long" className="text-muted">
          {t('whatGoes')}
        </Text>
      </View>

      <View className="gap-2 px-1">
        <Text variant="heading" accessibilityRole="header">
          {t('whatStaysTitle')}
        </Text>
        <Text variant="long" className="text-muted">
          {t('whatStays')}
        </Text>
      </View>
    </ScrollView>
  );
}

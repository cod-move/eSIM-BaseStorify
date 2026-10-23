import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { Icon } from '@/components/ui/icon';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';

/**
 * Security: changing the password, and deleting the
 * account in a group of its own at the bottom. Two-step sign-in and
 * the list of sessions wait for endpoints the store does not have yet.
 */
export function SecurityScreen() {
  const t = useTranslations('security');
  const router = useRouter();
  const bottom = useBottomSpace();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      <RowGroup>
        <NavRow
          title={t('changePassword')}
          description={t('changePasswordHint')}
          onPress={() => router.push('/account/security/password')}
        />
      </RowGroup>
      <RowGroup>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('deleteAccount')}
          accessibilityHint={t('deleteHint')}
          onPress={() => router.push('/account/security/delete')}
          className="min-h-[52px] flex-row items-center gap-3 py-3.5 active:opacity-70">
          <Icon name="trash" size={22} colorClassName="accent-danger" />
          <View className="flex-1 gap-1">
            <Text variant="subheading" className="text-danger">
              {t('deleteAccount')}
            </Text>
            <Text className="text-muted">{t('deleteHint')}</Text>
          </View>
        </Pressable>
      </RowGroup>
    </ScrollView>
  );
}

import { Linking, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { usePushPermission } from '@/features/notifications/use-push-permission';

/**
 * Whether the phone lets the app send notifications, as a row of Settings: when
 * it was never asked, a button asks; when the shopper refused, the phone's own
 * settings are the only place to change it.
 */
export function PushStatusRow() {
  const t = useTranslations('notifications');
  const { state, request } = usePushPermission();
  if (state === 'unsupported' || state === 'unknown') return null;

  const title = t('push.status.title');
  const on = state === 'granted';

  return (
    <View className="gap-2">
      <Text variant="subheading">{title}</Text>
      <RowGroup accessibilityLabel={title}>
        <View className="min-h-[52px] gap-3 py-3.5">
          <View className="flex-row items-center justify-between gap-3">
            <Text variant="subheading" className="flex-1">
              {t('push.status.label')}
            </Text>
            <Text className="text-muted">{t(on ? 'push.status.on' : 'push.status.off')}</Text>
          </View>
          {state === 'undetermined' ? (
            <Button label={t('push.status.turnOn')} size="sm" onPress={request} />
          ) : null}
          {state === 'denied' ? (
            <Button
              label={t('push.status.openSettings')}
              size="sm"
              variant="secondary"
              onPress={() => Linking.openSettings()}
            />
          ) : null}
        </View>
      </RowGroup>
    </View>
  );
}

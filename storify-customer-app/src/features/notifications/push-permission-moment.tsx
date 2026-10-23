import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

import { usePushMoment } from './use-push-moment';

/** After an order, the moment the app asks whether it may send notifications. Only once. */
export function PushPermissionMoment() {
  const t = useTranslations('notifications');
  const { open, close, allow } = usePushMoment();

  return (
    <Sheet
      visible={open}
      title={t('push.title')}
      onClose={close}
      footer={
        <View className="gap-3">
          <Button label={t('push.allow')} onPress={allow} />
          <Button label={t('push.later')} variant="secondary" onPress={close} />
        </View>
      }>
      <View className="items-center gap-4">
        <Icon name="bell" size={40} colorClassName="accent-primary" />
        <Text className="text-center text-muted">{t('push.body')}</Text>
      </View>
    </Sheet>
  );
}

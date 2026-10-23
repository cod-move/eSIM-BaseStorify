import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { IconCircle } from '@/components/ui/icon-circle';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

import { usePushMoment } from './use-push-moment';

/**
 * "Stay on top of the store": the sheet that says why before the phone's own
 * prompt asks for notifications. Once per phone; the
 * tabs layout holds it, so it can only show to an operator at work.
 */
export function PushMoment() {
  const t = useTranslations('push.moment');
  const { open, close, allow } = usePushMoment();

  return (
    <Sheet
      visible={open}
      onClose={close}
      footer={
        <>
          <Button label={t('allow')} variant="accent" onPress={() => void allow()} />
          <Button label={t('later')} variant="secondary" onPress={close} />
        </>
      }>
      <View className="items-center gap-3 pt-2">
        <IconCircle icon="bell" tone="info" size="lg" />
        <Text variant="heading" accessibilityRole="header" className="mt-1 text-center">
          {t('title')}
        </Text>
        <Text className="text-center text-muted">{t('body')}</Text>
      </View>
    </Sheet>
  );
}

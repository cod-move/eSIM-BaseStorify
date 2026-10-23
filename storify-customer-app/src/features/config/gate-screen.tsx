import { openURL } from 'expo-linking';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

type GateScreenProps = {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** A full-screen message shown in place of the app: maintenance, store unreachable. */
export function GateScreen({ title, body, actionLabel, onAction }: GateScreenProps) {
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-background p-8">
      <Text variant="title" className="text-center">
        {title}
      </Text>
      <Text variant="caption" className="text-center text-base">
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} className="mt-4 self-stretch" />
      ) : null}
    </View>
  );
}

type UpdatePromptProps = {
  visible: boolean;
  /** Where the update is, when the store gave an address. */
  storeUrl: string | undefined;
  onDismiss: () => void;
};

/**
 * "Update the app", over the app rather than in its place: this version may
 * still browse, and only the changes the store refuses (426) need the update.
 * "Not now" closes it until the next refusal.
 */
export function UpdatePrompt({ visible, storeUrl, onDismiss }: UpdatePromptProps) {
  const t = useTranslations('gate');
  return (
    <Sheet
      visible={visible}
      title={t('updateTitle')}
      onClose={onDismiss}
      footer={
        <View className="gap-2">
          {storeUrl ? (
            <Button label={t('updateAction')} onPress={() => void openURL(storeUrl)} />
          ) : null}
          <Button variant="ghost" label={t('updateLater')} onPress={onDismiss} />
        </View>
      }>
      <Text variant="caption" className="text-center text-base">
        {t('updateBody')}
      </Text>
    </Sheet>
  );
}

import { setStringAsync } from 'expo-clipboard';
import { openURL } from 'expo-linking';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { EsimNumberInstall } from '@/contracts/mobile/shop/v1/esim';

import { Panel } from './number-ui';

/**
 * Installing a number (NUM-07): the phone's own eSIM installer in one tap
 * where it has one, the QR code for another screen, the codes to type, and
 * the PIN and PUK the phone may ask for.
 */
export function NumberInstallTab({ install }: { install: EsimNumberInstall }) {
  const t = useTranslations('esim.number');
  const te = useTranslations('esim');
  const toast = useToast();
  const [copied, setCopied] = useState<string | null>(null);
  const link =
    Platform.OS === 'ios'
      ? install.iosLink
      : Platform.OS === 'android'
        ? install.androidLink
        : undefined;
  const copy = (value: string) => {
    setStringAsync(value)
      .then(() => setCopied(value))
      .catch(() => undefined);
  };
  const codes: [string, string | undefined][] = [
    [te('smdp'), install.smdpAddress],
    [te('activationCode'), install.matchingId],
    [t('lpaCode'), install.lpa],
  ];
  const pins: [string, string | undefined][] = [
    ['PIN1', install.pin1],
    ['PUK1', install.puk1],
    ['PIN2', install.pin2],
    ['PUK2', install.puk2],
  ];

  return (
    <Panel title={te('installTitle')}>
      <Text variant="caption">{t('installHint')}</Text>
      {link ? (
        <Button
          label={te('installNow')}
          onPress={() => {
            openURL(link).catch(() => toast.show({ message: te('installUnavailable') }));
          }}
        />
      ) : null}
      <View className="items-center gap-2">
        <AppImage
          image={install.qrImage}
          size="full"
          className="size-56 rounded-lg bg-background"
          contentFit="contain"
        />
        <Text variant="caption" className="text-center">
          {te('scanHint')}
        </Text>
      </View>
      <View className="gap-3">
        {[...codes, ...pins].map(([label, value]) =>
          value ? (
            <CopyRow
              key={label}
              label={label}
              value={value}
              copied={copied === value}
              onCopy={copy}
            />
          ) : null
        )}
      </View>
      <Text variant="caption">{t('pinHint')}</Text>
    </Panel>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: (value: string) => void;
}) {
  const t = useTranslations('esim.number');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      accessibilityHint={t('copy')}
      onPress={() => onCopy(value)}
      className="flex-row items-center gap-3 rounded-lg border border-border p-3 active:opacity-70">
      <View className="flex-1 gap-0.5">
        <Text variant="caption">{label}</Text>
        <Text className="font-mono" selectable>
          {value}
        </Text>
      </View>
      <Icon name={copied ? 'check' : 'copy'} size={18} />
    </Pressable>
  );
}

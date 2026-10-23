import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCSSVariable } from 'uniwind';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { readPageUrl } from '@/features/web/page-params';

import { ZoomablePicture } from './zoomable-picture';

/**
 * A picture on its own, over everything (`/viewer?url=…&title=…`): on a dark
 * backdrop, whole, to zoom into and look around (`ZoomablePicture`). The
 * name and the way out sit over it; a tap hides them and brings them back.
 * Dragging the picture away fades the backdrop to the screen underneath, then
 * closes. Only an http or https address is opened.
 */
export function PictureViewerScreen({
  url: given,
  title,
}: {
  url: string | string[] | undefined;
  title: string | string[] | undefined;
}) {
  const t = useTranslations('viewer');
  const common = useTranslations('common');
  const light = useCSSVariable('--color-on-scrim');
  const url = readPageUrl(given);
  const name = (Array.isArray(title) ? title[0] : title)?.trim() || t('picture');
  const [chrome, setChrome] = useState(true);
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1" accessibilityViewIsModal>
        {url && state !== 'failed' ? (
          <ZoomablePicture
            key={attempt}
            url={url}
            label={name}
            onDismiss={close}
            onTap={() => setChrome((shown) => !shown)}
            onLoad={() => setState('shown')}
            onError={() => setState('failed')}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-3 bg-scrim px-8">
            <Icon name="image" size={40} colorClassName="accent-on-scrim" strokeWidth={1.5} />
            <Text
              variant="subheading"
              accessibilityRole="header"
              className="text-center text-on-scrim">
              {url ? t('failedTitle') : t('missingTitle')}
            </Text>
            {url ? (
              <>
                <Text className="text-center text-on-scrim/80">{t('failedBody')}</Text>
                <Button
                  label={common('retry')}
                  variant="secondary"
                  icon="refresh"
                  className="mt-3"
                  onPress={() => {
                    setState('loading');
                    setAttempt((count) => count + 1);
                  }}
                />
              </>
            ) : null}
          </View>
        )}

        {url && state === 'loading' ? (
          <View
            style={{ pointerEvents: 'none' }}
            className="absolute inset-0 items-center justify-center">
            <ActivityIndicator
              accessibilityLabel={common('loading')}
              color={light ? String(light) : undefined}
            />
          </View>
        ) : null}

        {chrome || state !== 'shown' ? (
          <View className="absolute inset-x-0 top-0 pt-safe">
            <View className="min-h-14 flex-row items-center gap-3 px-4 py-2">
              <IconButton icon="close" label={common('close')} onPress={close} />
              <Text
                variant="title"
                accessibilityRole="header"
                numberOfLines={1}
                className="flex-1 text-center text-on-scrim">
                {name}
              </Text>
              <View className="size-10" />
            </View>
          </View>
        ) : null}
      </View>
    </GestureHandlerRootView>
  );
}

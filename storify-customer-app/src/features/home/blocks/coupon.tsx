import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { CouponBlock } from '@/contracts/mobile/shop/v1';
import { useOpenLink } from '@/features/config/use-open-link';
import { cn } from '@/lib/cn';

import { Paint, useHasEnded } from './countdown';

// How long the button says "Copied" before it offers to copy again.
const COPIED_MS = 2000;

/** A discount code and a button that copies it. Gone once the discount has ended. */
export function Coupon({ block }: { block: CouponBlock }) {
  const ended = useHasEnded(block.endsAt);
  return ended ? null : <CouponCard block={block} />;
}

function CouponCard({ block }: { block: CouponBlock }) {
  const t = useTranslations('home.coupon');
  const openLink = useOpenLink();
  const [copied, setCopied] = useState(false);
  const href = block.cta?.href;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    void Clipboard.setStringAsync(block.code).then(setCopied);
  };

  // On the store's picture, darkened as the store asks, the copy is light, as on the website.
  const onPicture = Boolean(block.image);
  const ink = onPicture ? 'text-on-scrim' : undefined;
  const soft = cn(ink, onPicture && 'opacity-80');
  const condition = [block.condition, block.endsOn].filter(Boolean).join(' · ');

  return (
    <Paint
      paint={onPicture ? undefined : block.background}
      className={cn('mx-4 rounded-2xl', onPicture ? 'bg-scrim' : 'border border-border')}>
      {block.image ? (
        <>
          <AppImage
            image={block.image}
            size="full"
            contentFit="cover"
            className="absolute inset-0 bg-transparent"
            decorative
          />
          <View
            className="absolute inset-0 bg-scrim"
            style={{ opacity: block.background?.overlay ?? 0.6 }}
          />
        </>
      ) : null}

      <View className="gap-4 p-5">
        <View className="gap-1">
          <Text variant="display" className={ink}>
            {block.offer}
          </Text>
          {condition ? (
            <Text variant="caption" className={soft}>
              {condition}
            </Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              copied ? t('copiedLabel', { code: block.code }) : t('copyLabel', { code: block.code })
            }
            onPress={copy}
            className={cn(
              'min-h-11 flex-1 flex-row items-center gap-2 rounded-lg border border-dashed px-3 active:opacity-80',
              onPicture ? 'border-on-scrim' : 'border-foreground'
            )}>
            <Text variant="label" className={cn('shrink', ink)} numberOfLines={1}>
              {block.code}
            </Text>
            <Icon
              name={copied ? 'check' : 'copy'}
              size={16}
              colorClassName={onPicture ? 'accent-on-scrim' : 'accent-muted'}
            />
            <Text variant="caption" className={soft} numberOfLines={1}>
              {copied ? t('copied') : t('copy')}
            </Text>
          </Pressable>
          {block.cta && href ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => openLink(href)}
              className={cn(
                'min-h-11 items-center justify-center rounded-lg px-5 active:opacity-90',
                onPicture ? 'bg-on-scrim' : 'bg-primary'
              )}>
              <Text
                variant="label"
                className={onPicture ? 'text-scrim' : 'text-primary-foreground'}>
                {block.cta.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Paint>
  );
}

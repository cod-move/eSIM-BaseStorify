import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { Icon, type IconName } from '@/components/ui/icon';
import { NavRow, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { useSession } from '@/features/auth/use-session';
import { useChatAvailable } from '@/features/chat/use-conversations';
import { useConfig } from '@/features/config/use-config';
import { useOpenLink } from '@/features/config/use-open-link';

/** The questions the app answers itself; anything more is on the store's help pages. */
const QUESTIONS = ['track', 'payment', 'delivery', 'cancel', 'returns', 'account'] as const;

/**
 * Help: the ways to reach the store, the common questions answered in a few
 * lines each, and the store's own FAQ, contact page and return policy
 * (screens of the app) for anything more.
 */
export function HelpCenter() {
  const t = useTranslations('help');
  const router = useRouter();
  const bottom = useBottomSpace();
  const { isSignedIn } = useSession();
  const chat = useChatAvailable();
  const website = useConfig().data?.store.websiteUrl;
  const openLink = useOpenLink();
  const [open, setOpen] = useState<string | null>(null);

  const go = (href: Href) => () => router.push(href);

  const actions: { key: string; icon: IconName; title: string; onPress?: () => void }[] = [
    {
      key: 'track',
      icon: 'truck',
      title: t('actions.track'),
      onPress: go(isSignedIn ? '/account/orders' : '/track-order'),
    },
    ...(isSignedIn && chat
      ? [
          {
            key: 'chat',
            icon: 'chat' as const,
            title: t('actions.message'),
            onPress: go('/account/inbox'),
          },
        ]
      : []),
    {
      key: 'contact',
      icon: 'mail',
      title: t('actions.contact'),
      onPress: go('/contact'),
    },
    { key: 'returns', icon: 'return', title: t('actions.returnPolicy'), onPress: go('/returns') },
  ];

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      <View className="gap-1 px-1">
        <Text variant="display" accessibilityRole="header">
          {t('title')}
        </Text>
        <Text variant="body" className="text-muted">
          {t('intro')}
        </Text>
      </View>

      <RowGroup>
        {actions
          .filter((action) => action.onPress)
          .map((action) => (
            <NavRow
              key={action.key}
              icon={action.icon}
              title={action.title}
              onPress={action.onPress}
            />
          ))}
      </RowGroup>

      <View className="gap-3">
        <Text variant="heading" accessibilityRole="header" className="px-1">
          {t('questionsTitle')}
        </Text>
        <View className="overflow-hidden rounded-2xl bg-surface">
          {QUESTIONS.map((key, index) => {
            const expanded = open === key;
            return (
              <View key={key}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setOpen(expanded ? null : key)}
                  className="min-h-12 flex-row items-center gap-3 px-4 py-3 active:opacity-80">
                  <Text variant="subheading" className="flex-1">
                    {t(`questions.${key}.q`)}
                  </Text>
                  <View className={expanded ? 'rotate-180' : undefined}>
                    <Icon name="chevron-down" size={20} colorClassName="accent-muted" />
                  </View>
                </Pressable>
                {expanded ? (
                  <Text variant="long" className="px-4 pb-4 text-muted">
                    {t(`questions.${key}.a`)}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>

      {website ? (
        <View className="items-center gap-3 rounded-2xl bg-surface px-5 py-6">
          <Icon name="help" size={28} />
          <Text variant="subheading" className="text-center">
            {t('moreTitle')}
          </Text>
          <Text variant="body" className="text-center text-muted">
            {t('moreBody')}
          </Text>
          <Button
            label={t('moreAction')}
            variant="outline"
            onPress={() => openLink('/faq')}
            className="self-stretch"
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

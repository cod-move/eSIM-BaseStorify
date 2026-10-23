import { useRouter } from 'expo-router';
import { FlatList, Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { CountBadge } from '@/components/ui/badge';
import { Reveal, useReveal } from '@/components/ui/motion';
import { Text } from '@/components/ui/text';
import type { ChatConversation } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { ChatAvatar } from './chat-avatar';
import { useParty, type ChatParties } from './parties';

type ConversationListProps = {
  items: ChatConversation[];
  parties: ChatParties;
};

/** The shopper's conversations, most recent first, the ones with unread messages marked. */
export function ConversationList({ items, parties }: ConversationListProps) {
  const tabBar = useTabBarHeight();
  const reveal = useReveal();

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-2"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      ItemSeparatorComponent={() => <View className="h-2" />}
      renderItem={({ item, index }) => (
        <Reveal entering={reveal(index)}>
          <ConversationRow item={item} parties={parties} />
        </Reveal>
      )}
    />
  );
}

/** One conversation, as a card: who it is with, the last message, when, and how many are unread. */
function ConversationRow({ item, parties }: { item: ChatConversation; parties: ChatParties }) {
  const t = useTranslations('chat');
  const format = useFormatter();
  const router = useRouter();
  const party = useParty(item, parties);
  const unread = item.unreadCount > 0;
  const date = format.dateTime(new Date(item.lastMessageAt), { dateStyle: 'medium' });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        party.name,
        unread ? t('unreadLabel', { count: item.unreadCount }) : null,
        item.lastMessagePreview,
        date,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.push({ pathname: '/account/inbox/[id]', params: { id: item.id } })}
      className="min-h-[72px] flex-row items-center gap-3 rounded-[20px] border border-transparent bg-surface p-3 active:opacity-80 dark:border-border">
      <ChatAvatar name={party.name} image={party.picture} brand size="md" />
      <View className="flex-1 gap-0.5">
        <Text variant="label" numberOfLines={1}>
          {party.name}
        </Text>
        <Text className={cn(!unread && 'text-muted')} numberOfLines={1}>
          {item.lastMessagePreview}
        </Text>
      </View>
      <View className="items-end gap-1.5 self-stretch py-0.5">
        <Text variant="caption">{date}</Text>
        <CountBadge tone="danger" count={item.unreadCount} />
      </View>
    </Pressable>
  );
}

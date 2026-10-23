import { router } from 'expo-router';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Avatar } from '@/components/ui/avatar';
import { CountBadge } from '@/components/ui/badge';
import { TextLink } from '@/components/ui/button';
import { PressableScale } from '@/components/ui/press-motion';
import { RowGroup } from '@/components/ui/rows';
import { InlineError, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import type { Conversation } from '@/contracts/mobile/biz/v1';
import { useChannelName } from '@/features/inbox/channel';
import { contactName } from '@/features/inbox/conversation-row';
import { OrderRow } from '@/features/orders/order-row';
import { useListTime } from '@/i18n/use-list-time';

import { HomeSection } from './home-section';
import { useHomeConversations, useHomeOrders } from './use-home-previews';

export function HomeOrderPreview({ query }: { query: ReturnType<typeof useHomeOrders> }) {
  const t = useTranslations('home');
  if (query.data && !query.data.items.length && !query.error) return null;
  return (
    <HomeSection
      title={t('ordersTitle')}
      action={
        <TextLink
          label={t('viewAll')}
          onPress={() => router.push({ pathname: '/orders', params: { tab: 'needs_action' } })}
        />
      }>
      {query.isPending ? <LoadingState shape="rows" rows={3} className="px-0 pt-0" /> : null}
      {query.data?.items.length ? (
        <RowGroup>
          {query.data.items.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </RowGroup>
      ) : null}
      {query.error ? (
        <InlineError error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
    </HomeSection>
  );
}

export function HomeConversationPreview({
  query,
}: {
  query: ReturnType<typeof useHomeConversations>;
}) {
  const t = useTranslations('home');
  if (query.data && !query.data.items.length && !query.error) return null;
  return (
    <HomeSection
      title={t('messagesTitle')}
      action={
        <TextLink
          label={t('viewInbox')}
          onPress={() => router.push({ pathname: '/inbox', params: { unreadOnly: 'true' } })}
        />
      }>
      {query.isPending ? (
        <LoadingState shape="rows" rows={2} leading className="px-0 pt-0" />
      ) : null}
      {query.data?.items.length ? (
        <RowGroup>
          {query.data.items.map((conversation) => (
            <ConversationPreview key={conversation.id} conversation={conversation} />
          ))}
        </RowGroup>
      ) : null}
      {query.error ? (
        <InlineError error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
    </HomeSection>
  );
}

function ConversationPreview({ conversation }: { conversation: Conversation }) {
  const t = useTranslations('inbox');
  const time = useListTime();
  const channel = useChannelName();
  const name = contactName(conversation, t('customer'));
  const preview = conversation.lastMessagePreview || t('attachmentOnly');
  const when = time(conversation.lastMessageAt);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        t('unread', { count: conversation.unreadCount }),
        channel(conversation.channel),
        preview,
        when,
      ].join(', ')}
      onPress={() =>
        router.push({ pathname: '/conversations/[id]', params: { id: conversation.id } })
      }
      className="min-h-18 flex-row items-center gap-3 px-4 py-3 active:opacity-80">
      <Avatar name={name} imageUrl={conversation.contact.imageUrl} />
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row items-center gap-2">
          <Text variant="label" className="flex-1" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption">{when}</Text>
        </View>
        <Text variant="caption">{channel(conversation.channel)}</Text>
        <View className="flex-row items-center gap-2">
          <Text variant="meta" numberOfLines={1} className="flex-1">
            {preview}
          </Text>
          <CountBadge count={conversation.unreadCount} />
        </View>
      </View>
    </PressableScale>
  );
}

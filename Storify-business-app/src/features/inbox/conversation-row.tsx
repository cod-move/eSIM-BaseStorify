import { Pressable, View } from 'react-native';
import { useNow, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Avatar } from '@/components/ui/avatar';
import { CountBadge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Conversation } from '@/contracts/mobile/biz/v1';
import { ConversationStatusChip, useStatusLabel } from '@/features/status/status-chip';
import { useListTime } from '@/i18n/use-list-time';
import { cn } from '@/lib/cn';

import { isOwnChannel, useChannelName } from './channel';
import { useWindowTime } from './window-time';

/** Within this long of a channel's reply window closing, the row warns. */
const CLOSING_SOON_MS = 6 * 60 * 60 * 1000;

/** Who the conversation is with, by the first thing the store knows of them. */
export function contactName(conversation: Conversation, fallback: string): string {
  const { name, email, phone } = conversation.contact;
  return name.trim() || email || phone || fallback;
}

type ConversationRowProps = {
  conversation: Conversation;
  onPress: () => void;
};

/** A small fact under a conversation: an icon and a word, `muted` unless it warns. */
function Fact({ icon, text, warn = false }: { icon: IconName; text: string; warn?: boolean }) {
  return (
    <View className="max-w-full shrink flex-row items-center gap-1">
      <Icon name={icon} size={13} colorClassName={warn ? 'accent-warning' : 'accent-muted'} />
      <Text variant="caption" numberOfLines={1} className={cn('shrink', warn && 'text-warning')}>
        {text}
      </Text>
    </View>
  );
}

/**
 * One conversation in the inbox, as a card of the shopper app's messages list,
 * with what an operator screens by: who and when, the product or subject (with
 * its picture), the last message with its channel, the unread count, and a line
 * of facts: the status, who it is assigned to, whose shop, and when the
 * channel's reply window closes, or that it has.
 */
export function ConversationRow({ conversation, onPress }: ConversationRowProps) {
  const t = useTranslations('inbox');
  const windowTime = useWindowTime();
  const time = useListTime();
  const channelName = useChannelName();
  const statusLabel = useStatusLabel();
  const name = contactName(conversation, t('customer'));
  const unread = conversation.unreadCount;
  const when = time(conversation.lastMessageAt);
  const subject = conversation.subject || conversation.product?.name || '';
  const text = conversation.lastMessagePreview || t('attachmentOnly');
  const preview = isOwnChannel(conversation.channel)
    ? text
    : t('preview', { channel: channelName(conversation.channel), text });
  const status = statusLabel('conversation', conversation.status);
  const windowEnd = conversation.replyWindowEndsAt
    ? Date.parse(conversation.replyWindowEndsAt)
    : Number.NaN;
  const now = useNow({ updateInterval: 60_000 }).getTime();
  const window = Number.isNaN(windowEnd)
    ? null
    : windowEnd <= now
      ? t('row.windowClosed')
      : windowEnd - now <= CLOSING_SOON_MS
        ? t('row.replyBy', { time: windowTime(new Date(windowEnd)) })
        : null;
  const facts = [
    conversation.assignedTo ? t('row.assigned', { name: conversation.assignedTo }) : null,
    conversation.vendorName ?? null,
    window,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        unread > 0 ? t('unread', { count: unread }) : null,
        subject,
        status,
        preview,
        when,
        ...facts,
      ]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
      className="flex-row gap-3 rounded-[20px] border border-transparent bg-surface p-3 active:opacity-80 dark:border-border">
      <Avatar name={name} imageUrl={conversation.contact.imageUrl} size="lg" />
      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-3">
          <Text
            variant="label"
            numberOfLines={1}
            className={cn('flex-1', unread > 0 && 'font-bold')}>
            {name}
          </Text>
          <Text
            variant="caption"
            className={unread > 0 ? 'font-semibold text-foreground' : undefined}>
            {when}
          </Text>
        </View>
        {subject ? (
          <View className="flex-row items-center gap-1.5">
            {conversation.product?.image ? (
              <AppImage
                image={conversation.product.image}
                size="thumb"
                decorative
                className="size-5 rounded bg-surface-alt"
              />
            ) : null}
            <Text variant="meta" numberOfLines={1} className="flex-1">
              {subject}
            </Text>
          </View>
        ) : null}
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className={cn('flex-1', unread > 0 ? 'font-medium' : 'text-muted')}>
            {preview}
          </Text>
          <CountBadge count={unread} />
        </View>
        <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          <ConversationStatusChip status={conversation.status} />
          {conversation.assignedTo ? (
            <Fact icon="user" text={t('row.assigned', { name: conversation.assignedTo })} />
          ) : null}
          {conversation.vendorName ? <Fact icon="store" text={conversation.vendorName} /> : null}
          {window ? <Fact icon="clock" text={window} warn /> : null}
        </View>
      </View>
    </Pressable>
  );
}

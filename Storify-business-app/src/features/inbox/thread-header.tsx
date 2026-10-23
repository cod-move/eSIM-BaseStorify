import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useNow, useTranslations } from 'use-intl';

import { isNetworkError } from '@/api/errors';
import { AppImage } from '@/components/ui/app-image';
import { Avatar } from '@/components/ui/avatar';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { Conversation } from '@/contracts/mobile/biz/v1';
import { ConversationStatusChip } from '@/features/status/status-chip';
import { useMe } from '@/features/workspace/use-me';
import { useCan } from '@/features/workspace/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { AssignSheet } from './assign-sheet';
import { useChannelName } from './channel';
import { useAssignConversation, useConversationStatus } from './use-inbox';
import { useWindowTime } from './window-time';

/** How the operator reaches the customer and who handles it: channel, contact, assignee, seller. */
export function useThreadFacts(conversation: Conversation | undefined): string[] {
  const t = useTranslations('inbox.thread');
  const channelName = useChannelName();
  if (!conversation) return [];
  const { contact } = conversation;
  return [
    channelName(conversation.channel),
    contact.email ?? contact.phone,
    conversation.assignedTo ? t('assigned', { name: conversation.assignedTo }) : null,
    conversation.vendorName,
  ].filter((fact): fact is string => Boolean(fact));
}

/** A quick step under the customer: write, call, their orders, the product; who has it, resolve. */
function QuickAction({
  icon,
  label,
  accessibilityLabel,
  onPress,
  busy = false,
  tone = 'default',
}: {
  icon: IconName;
  label: string;
  /** What a screen reader says, when the chip's word alone does not say what it does. */
  accessibilityLabel?: string;
  onPress?: () => void;
  /** Its change is on its way: not pressed again until the store answers. */
  busy?: boolean;
  tone?: 'default' | 'warning';
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={onPress ? { busy, disabled: busy } : undefined}
      disabled={!onPress || busy}
      onPress={onPress}
      className={cn(
        'min-h-9 flex-row items-center gap-1.5 rounded-full px-3.5 py-2 active:opacity-80',
        tone === 'warning' ? 'bg-warning-soft' : 'bg-surface-alt',
        busy && 'opacity-50'
      )}>
      <Icon
        name={icon}
        size={16}
        colorClassName={tone === 'warning' ? 'accent-warning' : 'accent-foreground'}
      />
      <Text variant="chip" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The team's own steps on the conversation, first among the quick steps, as
 * the store offers them (`actions`): who has it (the chip names them, and
 * opens the team to give it to someone else or nobody) or, for whoever may
 * only take it, "Assign to me"; and "Resolve" or "Reopen". Each says what
 * happened in a toast; the thread and the lists are read again.
 */
function TeamActions({ conversation }: { conversation: Conversation }) {
  const t = useTranslations('inbox.team');
  const toast = useToast();
  const describe = useErrorMessage();
  const me = useMe().data?.id;
  const assign = useAssignConversation(conversation.id);
  const status = useConversationStatus(conversation.id);
  const [choosing, setChoosing] = useState(false);
  const offered = conversation.actions;
  const canAssign = offered.includes('assign');
  const canClaim = offered.includes('claim') && me !== undefined;
  const { assignee } = conversation;
  const assigneeName = assignee ? (assignee.id === me ? t('yourself') : assignee.name) : null;

  const failed = (error: unknown) =>
    toast.show({
      message: describe(error),
      tone: isNetworkError(error) && error.kind === 'offline' ? 'offline' : 'danger',
    });
  const assignTo = (assigneeId: string | null, name?: string) =>
    assign.mutate(assigneeId, {
      onSuccess: () =>
        toast.show({
          message:
            assigneeId === null
              ? t('unassignedDone')
              : assigneeId === me
                ? t('assignedToYou')
                : t('assignedTo', { name: name ?? '' }),
          tone: 'success',
        }),
      onError: failed,
    });
  const changeStatus = (next: 'resolved' | 'open') =>
    status.mutate(next, {
      onSuccess: () =>
        toast.show({
          message: next === 'resolved' ? t('resolved') : t('reopened'),
          tone: 'success',
        }),
      onError: failed,
    });

  return (
    <>
      {canAssign ? (
        <QuickAction
          icon="users"
          label={assigneeName ?? t('assign')}
          accessibilityLabel={
            assigneeName ? t('assignedChange', { name: assigneeName }) : t('assignLabel')
          }
          busy={assign.isPending}
          onPress={() => setChoosing(true)}
        />
      ) : canClaim ? (
        <QuickAction
          icon="users"
          label={t('assignToMe')}
          busy={assign.isPending}
          onPress={() => assignTo(me)}
        />
      ) : null}
      {offered.includes('resolve') ? (
        <QuickAction
          icon="check-circle"
          label={t('resolve')}
          busy={status.isPending}
          onPress={() => changeStatus('resolved')}
        />
      ) : null}
      {offered.includes('reopen') ? (
        <QuickAction
          icon="refresh"
          label={t('reopen')}
          busy={status.isPending}
          onPress={() => changeStatus('open')}
        />
      ) : null}
      {canAssign ? (
        <AssignSheet
          visible={choosing}
          conversation={conversation}
          me={me}
          onChoose={assignTo}
          onClose={() => setChoosing(false)}
        />
      ) : null}
    </>
  );
}

/**
 * The top of a conversation: a white panel under the
 * status bar with the back button, the customer's picture, name and status,
 * how the conversation reaches them (channel, contact, assignee, seller), and
 * a row of quick steps: the team's own (who has it, resolve or reopen), the
 * customer's profile, a call, their orders, open the product, and when the
 * channel's reply window closes. It stays in view while the operator writes:
 * the reply depends on it.
 */
export function ThreadHeader({
  name,
  conversation,
}: {
  name: string;
  conversation?: Conversation;
}) {
  const common = useTranslations('common');
  const t = useTranslations('inbox.thread');
  const rowWords = useTranslations('inbox.row');
  const windowTime = useWindowTime();
  const now = useNow({ updateInterval: 60_000 }).getTime();
  const canOrders = useCan('VIEW_ORDERS');
  const canProducts = useCan('VIEW_PRODUCTS');
  const separator = common('separator');
  const facts = useThreadFacts(conversation);
  const contact = conversation?.contact;
  const product = conversation?.product;
  const windowEnd = conversation?.replyWindowEndsAt
    ? Date.parse(conversation.replyWindowEndsAt)
    : Number.NaN;
  const window = Number.isNaN(windowEnd)
    ? null
    : windowEnd <= now
      ? rowWords('windowClosed')
      : rowWords('replyBy', { time: windowTime(new Date(windowEnd)) });
  // The store names the customer for an operator who may open their profile.
  const customerId = conversation?.customerId;

  return (
    // Square, with a drop shadow over the thread: the cards that scroll under it stay apart from it.
    <View className="z-10 bg-surface pb-3 pt-safe-offset-2 shadow-float dark:border-b dark:border-border">
      <View className="flex-row items-center gap-3 px-4">
        <IconButton
          icon="arrow-left"
          directional
          label={common('back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/inbox'))}
        />
        <Avatar name={name} imageUrl={contact?.imageUrl} size="md" />
        <View className="flex-1">
          <Text variant="label" accessibilityRole="header" numberOfLines={1}>
            {name}
          </Text>
          {facts.length ? (
            <Text variant="caption" numberOfLines={1}>
              {facts.join(separator)}
            </Text>
          ) : null}
        </View>
        {conversation ? <ConversationStatusChip status={conversation.status} /> : null}
      </View>
      {conversation ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="grow-0 pt-3"
          contentContainerClassName="gap-2 px-4">
          <TeamActions conversation={conversation} />
          {customerId ? (
            <QuickAction
              icon="user"
              label={t('actions.profile')}
              onPress={() =>
                router.push({ pathname: '/customers/[id]', params: { id: customerId } })
              }
            />
          ) : null}
          {contact?.phone ? (
            <QuickAction
              icon="phone"
              label={t('actions.call')}
              onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
            />
          ) : null}
          {/* Their orders exactly (GET /orders?customerId=): a name, email or phone searched for would find others too. */}
          {canOrders && customerId ? (
            <QuickAction
              icon="receipt"
              label={t('actions.orders')}
              onPress={() =>
                router.push({ pathname: '/customers/[id]/orders', params: { id: customerId } })
              }
            />
          ) : null}
          {product && canProducts ? (
            <QuickAction
              icon="package"
              label={t('actions.product')}
              onPress={() =>
                router.push({ pathname: '/products/[id]', params: { id: product.id } })
              }
            />
          ) : null}
          {window ? <QuickAction icon="clock" label={window} tone="warning" /> : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

/**
 * What the conversation is about, above its oldest message, as the shopper
 * app's product card: the product's picture, the subject, the product and its
 * option. It opens the product, for an operator who may see products.
 */
export function ThreadAbout({ conversation }: { conversation: Conversation }) {
  const t = useTranslations('inbox.thread');
  const common = useTranslations('common');
  const canSeeProducts = useCan('VIEW_PRODUCTS');
  const { product } = conversation;
  const subject = conversation.subject.trim();
  const title = subject || product?.name;
  if (!title) return null;
  const details = [product && product.name !== title ? product.name : null, product?.variantName]
    .filter(Boolean)
    .join(common('separator'));
  const opens = Boolean(product && canSeeProducts);
  return (
    <Pressable
      accessibilityRole={opens ? 'link' : undefined}
      accessibilityLabel={opens ? t('openProduct', { name: product!.name }) : undefined}
      disabled={!opens}
      onPress={() =>
        product && router.push({ pathname: '/products/[id]', params: { id: product.id } })
      }
      className="mb-2 min-h-11 flex-row items-center gap-3 rounded-[20px] border border-transparent bg-surface p-2 pe-4 shadow-card active:opacity-80 dark:border-border">
      <View className="size-16 items-center justify-center overflow-hidden rounded-2xl bg-surface-alt">
        {product?.image ? (
          <AppImage image={product.image} size="thumb" decorative className="size-full" />
        ) : (
          <Icon name={product ? 'package' : 'chat'} colorClassName="accent-muted" />
        )}
      </View>
      <View className="flex-1 gap-1">
        <Text variant="subheading" numberOfLines={2}>
          {title}
        </Text>
        {details ? (
          <Text variant="caption" numberOfLines={1}>
            {details}
          </Text>
        ) : null}
      </View>
      {opens ? (
        <Icon name="chevron-right" size={20} directional colorClassName="accent-muted" />
      ) : null}
    </Pressable>
  );
}

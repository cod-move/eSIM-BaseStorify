import type { ReactElement } from 'react';
import { FlatList, View } from 'react-native';

import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/ui/state-view';
import { cn } from '@/lib/cn';

import { DaySeparator, MessageBubble, PendingBubble, type ThreadContact } from './message-bubble';
import type { ThreadRow } from './thread-rows';

type MessageListProps = {
  /** Newest first (`threadRows`). */
  rows: ThreadRow[];
  /** Older messages: asked for as the operator scrolls up. */
  onOlder: () => void;
  olderLoading: boolean;
  olderError: unknown;
  onRetryOlder: () => void;
  onRetryReply: (localId: string) => void;
  /** A refused reply: back to the draft, or let go. */
  onEditReply: (localId: string) => void;
  onDiscardReply: (localId: string) => void;
  onOpenWebsite?: () => void;
  /** The customer, for their picture beside their messages. */
  contact: ThreadContact;
  /** Who answers for the store, for the picture beside the team's replies. */
  team: ThreadContact;
  /** Above the oldest message, once there is nothing older: what the conversation is about. */
  about?: ReactElement | null;
};

/**
 * The messages, the newest at the bottom next to the composer. The list is
 * drawn upside down, so it starts at the newest message, keeps it in view when
 * the keyboard rises, and goes back in time upwards.
 */
export function MessageList({
  rows,
  onOlder,
  olderLoading,
  olderError,
  onRetryOlder,
  onRetryReply,
  onEditReply,
  onDiscardReply,
  onOpenWebsite,
  contact,
  team,
  about,
}: MessageListProps) {
  return (
    <FlatList
      inverted
      data={rows}
      keyExtractor={(row) => row.key}
      renderItem={({ item }) => {
        switch (item.kind) {
          case 'day':
            return <DaySeparator at={item.at} />;
          case 'pending':
            return (
              <PendingBubble
                reply={item.reply}
                onRetry={() => onRetryReply(item.reply.localId)}
                onEdit={() => onEditReply(item.reply.localId)}
                onDiscard={() => onDiscardReply(item.reply.localId)}
              />
            );
          case 'message':
            return (
              <MessageBubble
                message={item.message}
                firstOfRun={item.firstOfRun}
                lastOfRun={item.lastOfRun}
                contact={contact}
                team={team}
                onOpenWebsite={onOpenWebsite}
              />
            );
        }
      }}
      className="flex-1"
      contentContainerClassName="px-4 pb-3 pt-2"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      onEndReachedThreshold={0.3}
      onEndReached={onOlder}
      // The end of an upside-down list is its top: where older messages come in.
      ListFooterComponent={
        olderError ? (
          <InlineError error={olderError} onRetry={onRetryOlder} className="mb-3" />
        ) : olderLoading ? (
          <ThreadSkeleton bubbles={2} />
        ) : (
          (about ?? null)
        )
      }
    />
  );
}

/** A thread on its way: bubbles in the shape of a conversation, the customer's and the team's. */
export function ThreadSkeleton({ bubbles = 5 }: { bubbles?: number }) {
  return (
    <View className="gap-4 px-4 py-3">
      {Array.from({ length: bubbles }, (_, index) => (
        <View key={index} className={cn(index % 2 === 0 ? 'items-start' : 'items-end')}>
          <Skeleton className={cn('h-14 rounded-xl', index % 3 === 1 ? 'w-1/2' : 'w-2/3')} />
        </View>
      ))}
    </View>
  );
}

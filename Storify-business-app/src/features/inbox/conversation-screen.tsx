import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState } from '@/components/ui/state-view';
import { useOpenDashboard } from '@/features/web/use-open-page';
import { useMe } from '@/features/workspace/use-me';
import { useErrorMessage } from '@/i18n/use-error-message';

import { contactName } from './conversation-row';
import { useConversationOnScreen } from './conversation-on-screen';
import { MessageList, ThreadSkeleton } from './message-list';
import { ReplyArea } from './reply-area';
import { useTeamPicture } from './team-picture';
import { ThreadAbout, ThreadHeader } from './thread-header';
import { threadRows, unsettledReplies } from './thread-rows';
import { useConversationMessages } from './use-inbox';
import {
  THREAD_POLL_FAR_MS,
  THREAD_POLL_MS,
  THREAD_POLL_PAGES,
  refusedForWindow,
  useMarkThreadRead,
  useReplies,
} from './use-thread';

/**
 * One conversation with a customer, drawn as the
 * shopper app's chat: who it is with in a floating header, what it is about
 * above the oldest message, the messages, and the reply. While it is in front it is read again every
 * few seconds (less often once the operator reads far back) and marked read
 * as the customer's messages show; a message's push for it shows here, not
 * as a banner. A read that fails while the thread is on screen says so above
 * the messages, with "Try again"; one the store refused for good (the
 * conversation gone or out of reach) also stops the reads.
 */
export function ConversationScreen({ id }: { id: string }) {
  const titles = useTranslations('shell.titles');
  const inbox = useTranslations('inbox');
  const common = useTranslations('common');
  const describe = useErrorMessage();
  const focused = useIsFocused();
  useConversationOnScreen(id, focused);

  // Read far back (more pages than THREAD_POLL_PAGES), the thread is read less often.
  const [far, setFar] = useState(false);
  const thread = useConversationMessages(id, {
    pollMs: focused ? (far ? THREAD_POLL_FAR_MS : THREAD_POLL_MS) : false,
  });
  const nowFar = (thread.data?.pages ?? 1) > THREAD_POLL_PAGES;
  if (nowFar !== far) setFar(nowFar);
  const conversation = thread.data?.conversation;
  useMarkThreadRead(id, conversation?.unreadCount, focused, thread.dataUpdatedAt);
  const name = conversation ? contactName(conversation, inbox('customer')) : titles('conversation');
  const replies = useReplies(id, name);
  const me = useMe().data;
  const team = useTeamPicture(conversation);

  const openWebsite = useOpenDashboard();
  const header = <ThreadHeader name={name} conversation={conversation} />;

  if (!thread.data || !conversation) {
    return (
      <Screen header={header}>
        {thread.isError ? (
          <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />
        ) : (
          <ThreadSkeleton />
        )}
      </Screen>
    );
  }

  const { messages } = thread.data;
  const rows = threadRows(
    messages,
    unsettledReplies(messages, replies.pending, replies.storedIds, { id: me?.id, name: me?.name })
  );
  // The store refused a reply because the channel's window closed: final, until its word changes.
  const windowRefused = refusedForWindow(replies.pending, conversation, messages);

  return (
    <Screen header={header}>
      {/* Measured on the screen, not in its parent: the header above it would otherwise be left out, and the composer hide under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
        {thread.isRefetchError ? (
          <Banner
            tone="danger"
            title={inbox('thread.readFailed')}
            message={describe(thread.error)}
            action={{ label: common('retry'), onPress: () => void thread.refetch() }}
            className="mx-4 mt-2"
          />
        ) : null}
        {rows.length === 0 ? (
          <View className="flex-1 px-4 pt-2">
            <ThreadAbout conversation={conversation} />
            <EmptyState icon="chat" title={inbox('thread.empty')} />
          </View>
        ) : (
          <MessageList
            rows={rows}
            onOlder={() => {
              if (
                thread.hasNextPage &&
                !thread.isFetchingNextPage &&
                !thread.isFetchNextPageError
              ) {
                void thread.fetchNextPage();
              }
            }}
            olderLoading={thread.isFetchingNextPage}
            olderError={thread.isFetchNextPageError ? thread.error : null}
            onRetryOlder={() => void thread.fetchNextPage()}
            onRetryReply={replies.retry}
            onEditReply={replies.edit}
            onDiscardReply={replies.discard}
            onOpenWebsite={openWebsite}
            contact={{ name, imageUrl: conversation.contact.imageUrl }}
            team={team}
            about={thread.hasNextPage ? null : <ThreadAbout conversation={conversation} />}
          />
        )}
        <ReplyArea
          conversation={conversation}
          windowRefused={windowRefused}
          onSend={(draft) =>
            replies.reply(draft, {
              after: messages[0]?.createdAt,
              windowEndsAt: conversation.replyWindowEndsAt,
            })
          }
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

import { Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { KeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useChatParties } from '@/features/chat/parties';
import { Thread } from '@/features/chat/thread';
import { Composer } from '@/features/chat/thread-composer';
import { ThreadHeader } from '@/features/chat/thread-header';
import { useMarkRead, useSendMessage, useThread } from '@/features/chat/use-thread';

/**
 * One conversation with the store: who it is with, its messages, and a field to
 * answer in. Once it has loaded the conversation draws its own header; until
 * then, and when it fails, the navigator's stands. The tab bar steps aside
 * while it is open (`FloatingTabBar`), and the field rises with the keyboard:
 * the view measures itself on the screen, so the header above is counted.
 */
export default function ConversationScreen() {
  const t = useTranslations('chat');
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { bottom } = useSafeAreaInsets();
  const keyboard = useKeyboardState((state) => state.isVisible);
  const focused = useIsFocused();
  const thread = useThread(id, focused);
  const parties = useChatParties();
  const { send, pending, error } = useSendMessage(id);
  useMarkRead(id, thread.data?.conversation.unreadCount, focused);

  const body = () => {
    if (thread.isPending) return <LoadingState />;
    if (thread.isError) {
      return <ErrorState error={thread.error} onRetry={() => void thread.refetch()} />;
    }
    const { conversation } = thread.data;
    return (
      <>
        <ThreadHeader conversation={conversation} parties={parties} />
        <Thread page={thread.data} pending={pending} parties={parties} />
        {conversation.canReply ? (
          <Composer onSend={send} error={error} policy={conversation.attachments} />
        ) : (
          <Text className="px-4 pt-2 text-center text-muted">{t('closed')}</Text>
        )}
      </>
    );
  };

  return (
    <KeyboardAvoidingView behavior="padding" automaticOffset style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('title'), headerShown: thread.data === undefined }} />
      <View className="flex-1 bg-background" style={{ paddingBottom: (keyboard ? 0 : bottom) + 8 }}>
        {body()}
      </View>
    </KeyboardAvoidingView>
  );
}

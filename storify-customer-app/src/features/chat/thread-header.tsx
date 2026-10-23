import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import type { ChatConversation } from '@/contracts/mobile/shop/v1';

import { ChatAvatar } from './chat-avatar';
import { useParty, type ChatParties } from './parties';

type ThreadHeaderProps = {
  conversation: ChatConversation;
  parties: ChatParties;
};

/**
 * The top of a conversation: a round back button, and a pill with who the chat
 * is with (the seller's logo or the store's icon, else the first letter of the
 * name; and the name) and what it is about, in the store's own words.
 */
export function ThreadHeader({ conversation, parties }: ThreadHeaderProps) {
  const t = useTranslations('shell');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const party = useParty(conversation, parties);

  return (
    <View className="flex-row items-center gap-3 px-4 pb-2" style={{ paddingTop: insets.top + 8 }}>
      <IconButton
        icon="arrow-left"
        label={t('back')}
        directional
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <View
        accessibilityRole="header"
        className="min-h-14 flex-1 flex-row items-center gap-3 rounded-full border border-transparent bg-surface p-1.5 pe-5 shadow-button dark:border-border">
        <ChatAvatar name={party.name} image={party.picture} brand size="md" />
        <View className="flex-1">
          <Text variant="label" numberOfLines={1}>
            {party.name}
          </Text>
          <Text variant="caption" numberOfLines={1}>
            {conversation.subject}
          </Text>
        </View>
      </View>
    </View>
  );
}

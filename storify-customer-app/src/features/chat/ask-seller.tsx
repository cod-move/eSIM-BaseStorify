import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { ActionTile } from '@/components/ui/action-tile';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { CHAT_MESSAGE_MAX_LENGTH, type ProductDetail } from '@/contracts/mobile/shop/v1';
import { useSession } from '@/features/auth/use-session';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useStartChat } from './use-start-chat';

/**
 * "Ask the seller" on the product page: a question about the product, to
 * whoever sells it. It goes to the shopper's Messages, where the answer
 * arrives. A guest is sent to sign in first; a shopper who already asked
 * about it goes back to that conversation. Nothing shows while the seller
 * (or the store) takes no chats.
 */
export function AskSeller({ product, variantId }: { product: ProductDetail; variantId?: string }) {
  const t = useTranslations('chat');
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const { isSignedIn } = useSession();
  const chat = useStartChat({ productId: product.id, ...(variantId ? { variantId } : {}) });
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');

  const draft = chat.draft;
  if (isSignedIn && draft && !draft.available && !draft.conversation) return null;
  const seller = draft?.seller?.name ?? product.vendor?.name;
  const label = seller ? t('askSeller', { seller }) : t('askStore');

  const openConversation = (id: string) =>
    router.push({ pathname: '/account/inbox/[id]', params: { id } });

  const onPress = () => {
    if (!isSignedIn) router.push('/login');
    else if (draft?.conversation) openConversation(draft.conversation.id);
    else setOpen(true);
  };

  const close = () => {
    setOpen(false);
    chat.reset();
  };

  const send = async () => {
    const id = await chat.send(text);
    if (!id) return;
    setText('');
    setOpen(false);
    openConversation(id);
  };

  return (
    <>
      <ActionTile
        icon="chat"
        label={draft?.conversation ? t('openQuestion') : label}
        onPress={onPress}
      />
      <Sheet
        visible={open}
        title={label}
        onClose={close}
        footer={
          <Button
            variant="accent"
            label={t('send')}
            loading={chat.sending}
            disabled={!text.trim()}
            onPress={() => void send()}
          />
        }>
        <View className="gap-3">
          <Text variant="body" className="text-muted">
            {t('askBody', { product: product.name })}
          </Text>
          <TextField
            label={t('questionLabel')}
            placeholder={t('questionPlaceholder')}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            error={chat.error ? errorMessage(chat.error) : undefined}
            autoFocus
          />
        </View>
      </Sheet>
    </>
  );
}

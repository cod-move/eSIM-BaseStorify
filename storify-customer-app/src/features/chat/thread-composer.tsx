import { useLayoutEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { AppImage } from '@/components/ui/app-image';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Price } from '@/components/ui/price';
import { Text } from '@/components/ui/text';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  CHAT_REASONS,
  type AttachmentPolicy,
} from '@/contracts/mobile/shop/v1';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { AttachSheet } from './attach-sheet';
import { isImageFile, type MessageAttachment, type PickProblem } from './attachment';

type ComposerProps = {
  /** Resolves true when the store took the message: the field is then cleared. */
  onSend: (text: string, attachment?: MessageAttachment) => Promise<boolean>;
  /** The last send's failure, shown above the field. */
  error: unknown;
  /** What files the conversation takes. Without it, only a product can be added. */
  policy?: AttachmentPolicy;
};

/** The field's height at most (`max-h-28`): five lines, then it scrolls. */
const FIELD_MAX_HEIGHT = 112;

const PROBLEM_KEYS = {
  type: 'pickType',
  size: 'pickSize',
  camera: 'pickCamera',
} as const satisfies Record<PickProblem, string>;

/**
 * A floating pill with a button that adds a photo, a file or a product, the
 * field, and a round send button, which is off while there is neither text nor
 * anything added, or while a message is on its way. What was added shows above
 * the field until it is sent or removed; the text and what was added go back
 * when the store refuses the message.
 */
export function Composer({ onSend, error, policy }: ComposerProps) {
  const t = useTranslations('chat');
  const describe = useErrorMessage();
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<MessageAttachment | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [problem, setProblem] = useState<PickProblem | null>(null);
  const [sending, setSending] = useState(false);
  const canSend = (text.trim().length > 0 || attachment !== null) && !sending;
  const field = useRef<TextInput>(null);

  // On a phone the field grows with its text by itself. In a browser it is a
  // <textarea>, which keeps the height it opened with: it is fitted to its
  // text here, from one line up to the cap, and back when the text shrinks.
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !field.current) return;
    const area = field.current as unknown as { style: { height: string }; scrollHeight: number };
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, FIELD_MAX_HEIGHT)}px`;
  }, [text]);

  const submit = async () => {
    if (!canSend) return;
    const sent = { text, attachment };
    setText('');
    setAttachment(null);
    setSending(true);
    const taken = await onSend(sent.text, sent.attachment ?? undefined).finally(() =>
      setSending(false)
    );
    if (!taken) {
      setText((now) => now || sent.text);
      setAttachment((now) => now ?? sent.attachment);
    }
  };

  /**
   * A chat's own refusals: the app's sentence where it has one (a file or a
   * product the conversation does not take), else the store's own words, as
   * the store knows why it said no.
   */
  const refusal = (failure: unknown): string | null => {
    if (!isApiError(failure)) return null;
    const reason = CHAT_REASONS.find((known) => known === failure.reason);
    if (!reason) return null;
    // The key is built from what the store sent, so it cannot be typed.
    const key = `refusals.${reason}` as never;
    return t.has(key) ? t(key) : failure.message || null;
  };

  const notice = problem
    ? t(PROBLEM_KEYS[problem])
    : error
      ? (refusal(error) ?? describe(error))
      : null;

  return (
    <View className="gap-2 px-4 pt-2">
      {notice ? (
        <Text accessibilityRole="alert" className="ps-2 text-danger">
          {notice}
        </Text>
      ) : null}
      {attachment ? (
        <Attached attachment={attachment} onRemove={() => setAttachment(null)} />
      ) : null}
      <View className="min-h-14 flex-row items-end gap-2 rounded-[28px] border border-transparent bg-surface p-1.5 shadow-float dark:border-border">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('attach')}
          onPress={() => {
            setProblem(null);
            setChoosing(true);
          }}
          className="size-11 items-center justify-center rounded-full active:opacity-60">
          <Icon name="image-add" size={24} colorClassName="accent-muted" />
        </Pressable>
        <TextInput
          ref={field}
          value={text}
          onChangeText={setText}
          accessibilityLabel={t('composerLabel')}
          placeholder={t('composerPlaceholder')}
          placeholderTextColorClassName="accent-muted"
          selectionColorClassName="accent-accent"
          multiline
          // A <textarea> opens two lines tall; a phone's field starts at one by itself.
          {...(Platform.OS === 'web' ? { rows: 1 } : null)}
          textAlignVertical="center"
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          className={cn(
            'max-h-28 min-h-11 flex-1 py-3 text-[15px] text-foreground',
            // One line of 20 pt between the padding: 44 pt, as tall as the buttons beside it.
            Platform.OS === 'web' ? 'resize-none text-start leading-5 outline-none' : 'text-left'
          )}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('send')}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={() => void submit()}
          className="size-11 items-center justify-center rounded-full bg-primary active:opacity-80 disabled:opacity-40">
          <Icon name="arrow-up" size={22} colorClassName="accent-primary-foreground" />
        </Pressable>
      </View>
      <AttachSheet
        visible={choosing}
        onClose={() => setChoosing(false)}
        policy={policy}
        onAttach={(chosen) => {
          setProblem(null);
          setAttachment(chosen);
        }}
        onProblem={setProblem}
      />
    </View>
  );
}

/** What goes with the message, above the field: its picture or an icon, its name, and a remove button. */
function Attached({
  attachment,
  onRemove,
}: {
  attachment: MessageAttachment;
  onRemove: () => void;
}) {
  const t = useTranslations('chat');
  const product = attachment.kind === 'product' ? attachment.product : undefined;
  const file = attachment.kind === 'file' ? attachment.file : undefined;
  const name = product?.name ?? file?.name ?? '';
  const picture = product ? product.image : file && isImageFile(file) ? file.uri : undefined;

  return (
    <View className="flex-row items-center gap-3 rounded-2xl border border-transparent bg-surface p-2 shadow-card dark:border-border">
      <View className="size-12 items-center justify-center overflow-hidden rounded-xl bg-surface-alt">
        {picture ? (
          <AppImage image={picture} size="thumb" decorative className="size-full" />
        ) : (
          <Icon name={product ? 'bag' : 'link'} size={20} colorClassName="accent-muted" />
        )}
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        {product ? <Price price={product.price} compareAt={product.compareAtPrice} /> : null}
      </View>
      <IconButton
        icon="close"
        variant="outlined"
        label={t('removeAttachment', { name })}
        onPress={onRemove}
      />
    </View>
  );
}

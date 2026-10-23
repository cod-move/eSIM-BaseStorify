import { useEffect, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Banner } from '@/components/ui/banner';
import { TextLink } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  SendMessageRequest,
  type AttachmentPolicy,
  type Conversation,
} from '@/contracts/mobile/biz/v1';
import { knownStatus } from '@/features/status/status-tone';
import { useUploadErrorMessage } from '@/features/uploads/use-upload-error-message';
import { useOpenDashboard } from '@/features/web/use-open-page';
import { useCan } from '@/features/workspace/use-workspace';
import { cn } from '@/lib/cn';

import { AttachSheet } from './attach-sheet';
import { useChannelName } from './channel';
import { contactName } from './conversation-row';
import { useFileSize } from './message-bubble';
import type { DraftAttachment } from './reply-drafts';
import { useNoteComposer, useReplyDraft } from './use-reply-draft';
import { useWindowTime } from './window-time';
import type { ReplyDraft } from './use-thread';

/** The longest reply the store takes (the contract's). */
const MAX_LENGTH = SendMessageRequest.shape.body.maxLength ?? undefined;
/** Within this many characters of the limit, the composer says how many are left. */
const NEAR_LIMIT = 200;
/**
 * Channels whose files take no caption (the contract's word): the text goes
 * as a message of its own, after the file.
 */
const NO_CAPTION = new Set(['messenger', 'instagram']);
/** The longest wait a timer can hold (about 24 days); a window further away is checked on the next read. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Whether a channel's reply window is still open by the phone's clock. The
 * store's `canReply` is as of its answer, and an unchanged thread answers 304,
 * so the end time decides; the screen re-renders the moment it passes.
 */
function useWindowOpen(endsAt: string | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  const end = endsAt ? Date.parse(endsAt) : Number.NaN;
  const open = Number.isNaN(end) || end > now;

  useEffect(() => {
    if (!open || Number.isNaN(end)) return;
    const wait = end - Date.now();
    if (wait > MAX_TIMER_MS) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(wait, 0) + 50);
    return () => clearTimeout(timer);
  }, [end, open]);

  return open;
}

/** The space under what is pinned to the bottom: the home indicator, unless the keyboard covers it. */
function useBottomEdge(): number {
  const keyboard = useKeyboardState((state) => state.isVisible);
  const { bottom } = useSafeAreaInsets();
  return (keyboard ? 0 : bottom) + 12;
}

type ReplyAreaProps = {
  conversation: Conversation;
  /** A reply was refused because the channel's window has closed, and the store has not said otherwise since. */
  windowRefused: boolean;
  /** Sends a reply; false when nothing was sent (offline), so the field keeps the text. */
  onSend: (draft: ReplyDraft) => boolean;
};

/**
 * The bottom of a thread: the composer, or in its place
 * why the operator cannot reply: the conversation is closed, they may read
 * but not reply, or the channel's window has closed (answer on the website).
 * Where the store offers `note`, the operator can write a note for the team
 * instead (from the attach sheet, or under the notice): the composer turns
 * into the note's, in the note's colour, with a draft of its own.
 */
export function ReplyArea({ conversation, windowRefused, onSend }: ReplyAreaProps) {
  const t = useTranslations('inbox.thread');
  const inbox = useTranslations('inbox');
  const canReply = useCan('REPLY_INBOX');
  const channelName = useChannelName();
  const windowOpen = useWindowOpen(conversation.replyWindowEndsAt);
  const draft = useReplyDraft(conversation.id);
  const noteDraft = useReplyDraft(conversation.id, 'note');
  const { noting, setNoting } = useNoteComposer(conversation.id);
  const openWebsite = useOpenDashboard();
  const status = knownStatus('conversation', conversation.status);
  const name = contactName(conversation, inbox('customer'));
  const canNote = conversation.actions.includes('note');
  const addNote = canNote ? () => setNoting(true) : undefined;

  if (noting && canNote) {
    return (
      <NoteComposer
        name={name}
        text={noteDraft.text}
        onChangeText={noteDraft.setText}
        onSend={(body) => onSend({ body, note: true })}
        onClose={() => setNoting(false)}
      />
    );
  }
  if (status === 'closed' || status === 'spam') {
    return (
      <Notice icon="lock" text={status === 'spam' ? t('spam') : t('closed')} onAddNote={addNote} />
    );
  }
  if (!canReply) return <Notice icon="eye" text={t('readOnly')} />;
  if (windowRefused || !windowOpen) {
    return (
      <WindowClosed
        message={t('windowClosed', { channel: channelName(conversation.channel) })}
        onOpenWebsite={openWebsite}
        onAddNote={addNote}
      />
    );
  }
  if (!conversation.canReply) {
    return (
      <Notice
        icon="alert-circle"
        text={t('cannotReply')}
        onOpenWebsite={openWebsite}
        onAddNote={addNote}
      />
    );
  }
  return (
    <Composer
      name={name}
      replyUntil={conversation.replyWindowEndsAt}
      policy={conversation.attachments}
      captions={!NO_CAPTION.has(conversation.channel)}
      text={draft.text}
      onChangeText={draft.setText}
      attached={draft.attached}
      onAttach={draft.setAttached}
      onSend={onSend}
      onAddNote={addNote}
    />
  );
}

type ComposerProps = {
  /** Who the reply goes to, for screen readers. */
  name: string;
  /** When the channel's window closes, if it has one. */
  replyUntil?: string;
  /** What files the conversation takes; absent when none. */
  policy?: AttachmentPolicy;
  /** A file may carry the text as its caption. */
  captions: boolean;
  text: string;
  onChangeText: (text: string) => void;
  /** The product or file on the reply, kept with its draft. */
  attached?: DraftAttachment;
  onAttach: (attached: DraftAttachment | null) => void;
  onSend: (draft: ReplyDraft) => boolean;
  /** Turns the composer into the note's, where the store offers `note`. */
  onAddNote?: () => void;
};

/** The composer's growing text field: up to five lines, then it scrolls. */
function ComposerField({
  value,
  onChangeText,
  label,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColorClassName="accent-muted"
      selectionColorClassName="accent-accent"
      multiline
      // The browser's text area starts two rows tall: one, as on a phone.
      {...(Platform.OS === 'web' ? { numberOfLines: 1 } : null)}
      maxLength={MAX_LENGTH}
      textAlignVertical="center"
      className={cn(
        'max-h-32 min-h-11 flex-1 py-2.5 text-[15px] leading-[20px] text-foreground',
        Platform.OS === 'web' ? 'resize-none text-start outline-none' : 'text-left'
      )}
    />
  );
}

/** The round `primary` send button at the composer's end, faded while there is nothing to send. */
function SendButton({
  label,
  ready,
  onPress,
}: {
  label: string;
  ready: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !ready }}
      disabled={!ready}
      onPress={onPress}
      className={cn(
        'size-11 items-center justify-center rounded-full bg-primary active:opacity-80',
        !ready && 'opacity-40'
      )}>
      <Icon name="arrow-up" size={22} colorClassName="accent-primary-foreground" />
    </Pressable>
  );
}

/** How many characters are left, near the store's limit. */
function CharactersLeft({ text }: { text: string }) {
  const t = useTranslations('inbox.thread');
  const left = MAX_LENGTH !== undefined ? MAX_LENGTH - text.length : null;
  if (left === null || left > NEAR_LIMIT) return null;
  return (
    <Text variant="caption" className={cn('px-5', left <= 0 && 'text-danger')}>
      {t('charactersLeft', { count: Math.max(left, 0) })}
    </Text>
  );
}

/**
 * The composer of a note for the team: the same floating pill in the note's
 * own `warning-soft`, under a lock and "Only your team sees this", so it is
 * never taken for a reply. Its draft is the thread's note draft, apart from
 * the reply's. The close button goes back to replying, keeping the note.
 */
function NoteComposer({
  name,
  text,
  onChangeText,
  onSend,
  onClose,
}: {
  /** Whose conversation it is on, for screen readers. */
  name: string;
  text: string;
  onChangeText: (text: string) => void;
  /** Saves the note; false when nothing was sent (offline), so the field keeps it. */
  onSend: (body: string) => boolean;
  onClose: () => void;
}) {
  const t = useTranslations('inbox.thread');
  const bottom = useBottomEdge();
  const body = text.trim();
  const send = () => {
    if (!body || !onSend(body)) return;
    onChangeText('');
  };

  return (
    <View className="gap-1.5 px-4 pt-2" style={{ paddingBottom: bottom }}>
      <View className="gap-1 rounded-[28px] border border-transparent bg-warning-soft p-1.5 shadow-float dark:border-border">
        <View className="flex-row items-center gap-2 ps-3.5">
          <Icon name="lock" size={16} colorClassName="accent-warning" />
          <View className="flex-1">
            <Text variant="label">{t('noteMode.title')}</Text>
            <Text variant="caption">{t('noteHint')}</Text>
          </View>
          <IconButton icon="close" variant="plain" label={t('noteMode.close')} onPress={onClose} />
        </View>
        <View className="min-h-11 flex-row items-end gap-1 ps-2">
          <ComposerField
            value={text}
            onChangeText={onChangeText}
            label={t('noteMode.label', { name })}
            placeholder={t('noteMode.placeholder')}
          />
          <SendButton label={t('noteMode.save')} ready={Boolean(body)} onPress={send} />
        </View>
      </View>
      <CharactersLeft text={text} />
    </View>
  );
}

/**
 * The shopper app's composer: a floating `surface` pill with the attach
 * button, the field and a round `primary` send button; it rises with the
 * keyboard. A product or a file put on the reply shows above the field, to be
 * sent with the text (or taken off).
 */
function Composer({
  name,
  replyUntil,
  policy,
  captions,
  text,
  onChangeText,
  attached,
  onAttach,
  onSend,
  onAddNote,
}: ComposerProps) {
  const t = useTranslations('inbox.thread');
  const toast = useToast();
  const describeFile = useUploadErrorMessage();
  const [attaching, setAttaching] = useState(false);
  const windowTime = useWindowTime();
  const bottom = useBottomEdge();
  const body = text.trim();
  const left = MAX_LENGTH !== undefined ? MAX_LENGTH - text.length : null;

  const until = replyUntil ? new Date(replyUntil) : null;
  const untilWords =
    until && !Number.isNaN(until.getTime())
      ? t('replyUntil', {
          time: windowTime(until),
        })
      : null;

  const ready = Boolean(body || attached);
  const send = () => {
    if (!ready) return;
    // On a channel without captions the file goes first, and the text once the store has it.
    if (!onSend({ body, ...attached, ...(captions ? {} : { textApart: true }) })) return;
    onChangeText('');
    onAttach(null);
  };

  return (
    <View className="gap-1.5 px-4 pt-2" style={{ paddingBottom: bottom }}>
      <View className="gap-1.5 rounded-[28px] border border-transparent bg-surface p-1.5 shadow-float dark:border-border">
        {attached ? <AttachedCard attached={attached} onRemove={() => onAttach(null)} /> : null}
        <View className="min-h-11 flex-row items-end gap-1">
          <IconButton
            icon="plus"
            variant="plain"
            label={t('attach')}
            onPress={() => setAttaching(true)}
          />
          <ComposerField
            value={text}
            onChangeText={onChangeText}
            label={t('composerLabel', { name })}
            placeholder={t('placeholder')}
          />
          <SendButton label={t('send')} ready={ready} onPress={send} />
        </View>
      </View>
      <AttachSheet
        visible={attaching}
        onClose={() => setAttaching(false)}
        policy={policy}
        onProduct={(product) => onAttach({ product })}
        onFile={(file) => onAttach({ file })}
        onFileError={(error) => toast.show({ message: describeFile(error), tone: 'danger' })}
        onNote={onAddNote}
      />
      {left !== null && left <= NEAR_LIMIT ? (
        <CharactersLeft text={text} />
      ) : untilWords ? (
        <Text variant="caption" className="px-5">
          {untilWords}
        </Text>
      ) : null}
    </View>
  );
}

/** The product or file on the reply: its picture, its name, its price or size, and a way to take it off. */
function AttachedCard({ attached, onRemove }: { attached: DraftAttachment; onRemove: () => void }) {
  const t = useTranslations('inbox.attach');
  const size = useFileSize();
  const { product, file } = attached;
  const picture = product?.image
    ? product.image
    : file?.previewUri && file.mimeType.startsWith('image/')
      ? { thumb: file.previewUri, card: file.previewUri, full: file.previewUri }
      : undefined;
  const title = product?.name ?? file?.filename ?? '';
  const detail = product ? (product.price ?? t('priceOnRequest')) : size(file?.size);

  return (
    <View
      accessibilityLabel={t('attached', { name: title })}
      className="flex-row items-center gap-3 rounded-[22px] bg-surface-alt p-2">
      {picture ? (
        <AppImage
          image={picture}
          size="thumb"
          decorative
          className="size-12 rounded-xl bg-surface"
        />
      ) : (
        <View className="size-12 items-center justify-center rounded-xl bg-surface">
          <Icon name={product ? 'package' : 'paperclip'} size={22} colorClassName="accent-muted" />
        </View>
      )}
      <View className="flex-1 gap-0.5">
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <IconButton
        icon="close"
        variant="plain"
        label={t('remove', { name: title })}
        onPress={onRemove}
      />
    </View>
  );
}

/** Why there is no composer, where it would be; and, where the store offers it, the way to a note. */
function Notice({
  icon,
  text,
  onOpenWebsite,
  onAddNote,
}: {
  icon: IconName;
  text: string;
  onOpenWebsite?: () => void;
  onAddNote?: () => void;
}) {
  const common = useTranslations('common');
  const bottom = useBottomEdge();

  return (
    <View className="gap-1 px-4 pt-2" style={{ paddingBottom: bottom }}>
      <View
        accessibilityRole="text"
        className="min-h-14 flex-row items-center gap-3 rounded-[28px] border border-transparent bg-surface px-5 py-3 shadow-float dark:border-border">
        <Icon name={icon} size={20} colorClassName="accent-muted" />
        <Text className="flex-1 text-muted">{text}</Text>
        {onOpenWebsite ? <TextLink label={common('openWebsite')} onPress={onOpenWebsite} /> : null}
      </View>
      <AddNoteLink onPress={onAddNote} />
    </View>
  );
}

/** The channel takes no more normal replies: answer on the website. */
function WindowClosed({
  message,
  onOpenWebsite,
  onAddNote,
}: {
  message: string;
  onOpenWebsite?: () => void;
  onAddNote?: () => void;
}) {
  const t = useTranslations('inbox.thread');
  const common = useTranslations('common');
  const bottom = useBottomEdge();

  return (
    <View className="gap-1 px-4 pt-2" style={{ paddingBottom: bottom }}>
      <Banner
        tone="warning"
        icon="clock"
        title={t('windowClosedTitle')}
        message={message}
        action={
          onOpenWebsite ? { label: common('openWebsite'), onPress: onOpenWebsite } : undefined
        }
      />
      <AddNoteLink onPress={onAddNote} />
    </View>
  );
}

/** Under a notice: a note for the team can still be written where no reply can. */
function AddNoteLink({ onPress }: { onPress?: () => void }) {
  const t = useTranslations('inbox.thread');
  if (!onPress) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('noteMode.add')}
      onPress={onPress}
      className="min-h-11 flex-row items-center justify-center gap-1.5 active:opacity-70">
      <Icon name="lock" size={14} colorClassName="accent-warning" />
      <Text variant="label" className="text-link">
        {t('noteMode.add')}
      </Text>
    </Pressable>
  );
}

import type { ReactNode } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Avatar } from '@/components/ui/avatar';
import { TextLink } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { ConversationMessage, MessageAttachment } from '@/contracts/mobile/biz/v1';
import { storeWord } from '@/features/status/status-tone';
import { useOpenPicture } from '@/features/viewer/use-open-picture';
import { useOpenPage } from '@/features/web/use-open-page';
import { useDayLabel } from '@/i18n/use-list-time';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { SharedProductCard } from './shared-product-card';
import type { PendingReply } from './thread-rows';
import { canRetryReply } from './use-thread';

/**
 * The thread's rows, drawn as the shopper app's chat:
 * the customer's bubbles at the start under their picture, the team's in
 * `primary` at the end beside the store's picture, notes the team keeps in
 * a `warning-soft` bubble with a lock, the store's own lines centred, and the
 * day between. A run of one sender's messages shares one picture and one time.
 */

const DELIVERY = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;

/** Bubbles are 20 pt round, but the corner by the sender's picture is 6, on a run's first. */
const SENDER_CORNER = 6;
/** What a message without a picture leaves free: a 32 pt picture and the gap after it. */
const PICTURE_SPACE = 'w-8';

// A line under a bubble at the end edge ends there too: on a phone `text-right`
// is "end" once the layout is right-to-left (see text.tsx); a browser needs `text-end`.
const END = Platform.OS === 'web' ? 'text-end' : 'text-right';

/** "10:42", in the operator's language: the day is in the heading above. */
function useClock(): (iso: string) => string {
  const format = useFormatter();
  return (iso) => format.dateTime(new Date(iso), { hour: 'numeric', minute: '2-digit' });
}

/** The day above its first message: "Today", "Yesterday", "Mon, 5 Oct". */
export function DaySeparator({ at }: { at: string }) {
  const day = useDayLabel();

  return (
    <View className="items-center pb-1 pt-4">
      <Text variant="caption" accessibilityRole="header" className="font-semibold">
        {day(at)}
      </Text>
    </View>
  );
}

/**
 * Who a picture beside messages stands for: the customer, or who answers for
 * the store (the store's square mark, or the seller's logo in a seller's
 * conversation), as the customer sees it.
 */
export type ThreadContact = { name: string; imageUrl?: string };

type MessageProps = {
  message: ConversationMessage;
  /** The first of a run of one sender's messages: the picture, and the team's writer's name. */
  firstOfRun: boolean;
  /** The last of its run: the time (and how far a reply got). */
  lastOfRun: boolean;
  contact: ThreadContact;
  /** Who answers for the store: the picture beside the team's replies. */
  team: ThreadContact;
  /** Opens the website, for what only it can show. */
  onOpenWebsite?: () => void;
};

/** One message, by who wrote it. */
export function MessageBubble(props: MessageProps) {
  const { message } = props;
  if (message.senderType === 'system') return <SystemLine message={message} />;
  if (message.direction === 'internal') return <Note {...props} />;
  if (message.direction === 'outbound') return <TeamMessage {...props} />;
  return <CustomerMessage {...props} />;
}

/** The text to show: none when it only stands in for the product's card. */
function bodyOf(message: ConversationMessage): string {
  return message.product && message.bodyIsFallback ? '' : message.body;
}

/** A message's pictures, drawn on their own, and the rest of what came with it (files), drawn in its bubble. */
function split(attachments: MessageAttachment[]) {
  return {
    pictures: attachments.filter((attachment) => attachment.type === 'image'),
    files: attachments.filter((attachment) => attachment.type !== 'image'),
  };
}

/** Whether a message has anything for a bubble: pictures and a product shared on their own have none. */
function hasBubble(message: ConversationMessage, files: MessageAttachment[]): boolean {
  return Boolean(bodyOf(message) || files.length || message.webOnlyAttachments);
}

/** The corner by the picture, sharp on a run's first bubble. */
function corner(side: 'start' | 'end', first: boolean) {
  if (!first) return undefined;
  return side === 'start'
    ? { borderTopStartRadius: SENDER_CORNER }
    : { borderTopEndRadius: SENDER_CORNER };
}

/**
 * One line of a run at its sender's side: the sender's picture beside the
 * run's first block (`picture`), the room it takes beside the others.
 */
function Lane({
  side,
  picture,
  className,
  children,
}: {
  side: 'start' | 'end';
  picture: ReactNode | null;
  className?: string;
  children: ReactNode;
}) {
  const beside = picture ?? <View className={PICTURE_SPACE} />;

  return (
    <View
      className={cn(
        'flex-row items-start gap-2',
        side === 'start' ? 'pe-10' : 'justify-end ps-10',
        className
      )}>
      {side === 'start' ? beside : null}
      {children}
      {side === 'end' ? beside : null}
    </View>
  );
}

/** The customer's: a `surface` bubble at the start, under their picture. */
function CustomerMessage({ message, firstOfRun, lastOfRun, contact, onOpenWebsite }: MessageProps) {
  const clock = useClock();
  const time = clock(message.createdAt);
  const { pictures, files } = split(message.attachments);
  const bubble = hasBubble(message, files);
  const avatar = <Avatar name={contact.name} imageUrl={contact.imageUrl} size="sm" />;
  // The run's first block carries the sharp corner and the picture beside it.
  const bubbleFirst = firstOfRun && pictures.length === 0;

  return (
    <View className={firstOfRun ? 'pt-3' : 'pt-1'}>
      {pictures.length ? (
        <Lane side="start" picture={firstOfRun ? avatar : null}>
          <Pictures pictures={pictures} style={corner('start', firstOfRun)} />
        </Lane>
      ) : null}
      {bubble ? (
        <Lane
          side="start"
          picture={bubbleFirst ? avatar : null}
          className={pictures.length ? 'pt-1' : undefined}>
          <View
            accessible
            accessibilityLabel={[message.senderName, time, bodyOf(message)]
              .filter(Boolean)
              .join(', ')}
            style={corner('start', bubbleFirst)}
            className="shrink gap-2 rounded-[20px] border border-transparent bg-surface px-4 py-2.5 dark:border-border">
            <Files files={files} />
            {bodyOf(message) ? (
              <Text variant="long" selectable>
                {bodyOf(message)}
              </Text>
            ) : null}
            <WebOnly count={message.webOnlyAttachments} onOpenWebsite={onOpenWebsite} />
          </View>
        </Lane>
      ) : null}
      {message.product ? (
        <View className={bubble || pictures.length ? 'pt-2' : undefined}>
          <SharedProductCard product={message.product} />
        </View>
      ) : null}
      {lastOfRun ? (
        <Text variant="caption" className="ps-10 pt-1">
          {time}
        </Text>
      ) : null}
    </View>
  );
}

/** The team's: a `primary` bubble at the end beside the store's picture, and how far it got. */
function TeamMessage({ message, firstOfRun, lastOfRun, team, onOpenWebsite }: MessageProps) {
  const t = useTranslations('inbox.thread');
  const clock = useClock();
  const time = clock(message.createdAt);
  const known = DELIVERY.find((status) => status === message.deliveryStatus);
  const status = known ? t(`delivery.${known}`) : storeWord(message.deliveryStatus);
  const failed = known === 'failed';
  const { pictures, files } = split(message.attachments);
  const bubble = hasBubble(message, files);
  const avatar = (
    <Avatar name={team.name || message.senderName} imageUrl={team.imageUrl} size="sm" />
  );
  const bubbleFirst = firstOfRun && pictures.length === 0;

  return (
    <View className={firstOfRun ? 'pt-3' : 'pt-1'}>
      {firstOfRun ? (
        <Text variant="caption" className={cn('pb-1 pe-10', END)}>
          {message.senderName}
        </Text>
      ) : null}
      {pictures.length ? (
        <Lane side="end" picture={firstOfRun ? avatar : null}>
          <Pictures
            pictures={pictures}
            style={corner('end', firstOfRun)}
            className={failed ? 'border-[1.5px] border-danger' : undefined}
          />
        </Lane>
      ) : null}
      {bubble ? (
        <Lane
          side="end"
          picture={bubbleFirst ? avatar : null}
          className={pictures.length ? 'pt-1' : undefined}>
          <View
            accessible
            accessibilityLabel={[message.senderName, time, status, bodyOf(message)]
              .filter(Boolean)
              .join(', ')}
            style={corner('end', bubbleFirst)}
            className={cn(
              'shrink gap-2 rounded-[20px] bg-primary px-4 py-2.5',
              failed && 'border-[1.5px] border-danger'
            )}>
            <Files files={files} onPrimary />
            {bodyOf(message) ? (
              <Text variant="long" selectable className="text-primary-foreground">
                {bodyOf(message)}
              </Text>
            ) : null}
            <WebOnly count={message.webOnlyAttachments} onOpenWebsite={onOpenWebsite} onPrimary />
          </View>
        </Lane>
      ) : null}
      {message.product ? (
        <View className={bubble || pictures.length ? 'pt-2' : undefined}>
          <SharedProductCard product={message.product} />
        </View>
      ) : null}
      {lastOfRun || failed ? (
        <Text variant="caption" className={cn('pe-10 pt-1', END, failed && 'text-danger')}>
          {t('timeAndStatus', { time, status })}
        </Text>
      ) : null}
      {failed && message.error ? (
        <Text variant="caption" className={cn('ps-10 pe-10 text-danger', END)}>
          {message.error}
        </Text>
      ) : null}
    </View>
  );
}

/** A note the team keeps: never to be taken for a reply, so it carries a lock and its own colour. */
function Note({ message, firstOfRun, lastOfRun, onOpenWebsite }: MessageProps) {
  const t = useTranslations('inbox.thread');
  const clock = useClock();
  const time = clock(message.createdAt);
  const title = t('note', { name: message.senderName });
  const { pictures, files } = split(message.attachments);

  return (
    <View className={firstOfRun ? 'pt-3' : 'pt-1'}>
      <Lane side="end" picture={firstOfRun ? <Avatar name={message.senderName} size="sm" /> : null}>
        <View
          accessible
          accessibilityLabel={[title, t('noteHint'), time, message.body].join(', ')}
          style={corner('end', firstOfRun)}
          className="shrink gap-1.5 rounded-[20px] bg-warning-soft px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <Icon name="lock" size={14} colorClassName="accent-warning" />
            <Text variant="label" className="shrink">
              {title}
            </Text>
          </View>
          {/* Inside the note, so a picture the team keeps is never taken for one sent. */}
          {pictures.length ? <Pictures pictures={pictures} className="rounded-xl" /> : null}
          <Files files={files} />
          {message.body ? (
            <Text variant="long" selectable>
              {message.body}
            </Text>
          ) : null}
          <WebOnly count={message.webOnlyAttachments} onOpenWebsite={onOpenWebsite} />
        </View>
      </Lane>
      {lastOfRun ? (
        <Text variant="caption" className={cn('pe-10 pt-1', END)}>
          {time}
        </Text>
      ) : null}
    </View>
  );
}

/** The store's own line: an assignment, a change of status. */
function SystemLine({ message }: { message: ConversationMessage }) {
  return (
    <View className="items-center px-6 py-3">
      <View className="rounded-full bg-surface-alt px-3 py-1">
        <Text variant="caption" className="text-center">
          {message.body}
        </Text>
      </View>
    </View>
  );
}

type PendingProps = {
  reply: PendingReply;
  onRetry: () => void;
  /** Takes a refused one back to the draft, to change it. */
  onEdit: () => void;
  /** Lets a refused one go. */
  onDiscard: () => void;
};

/**
 * A reply on its way: the team's bubble, faded until the store answers, or
 * "not sent" with why. A note on its way is drawn as a note from the start.
 */
export function PendingBubble(props: PendingProps) {
  if (props.reply.note) return <PendingNote {...props} />;
  return <PendingReplyBubble {...props} />;
}

/** A note on its way: the note's own bubble with its lock, faded until the store keeps it. */
function PendingNote({ reply, ...actions }: PendingProps) {
  const t = useTranslations('inbox.thread');
  const state = reply.failed ? t('noteNotSaved') : t('noteSaving');
  const title = t('noteMode.title');

  return (
    <View className="pt-1" accessibilityLiveRegion="polite">
      <Lane side="end" picture={null}>
        <View
          accessible
          accessibilityLabel={[title, t('noteHint'), state, reply.body].join(', ')}
          className={cn(
            'shrink gap-1.5 rounded-[20px] bg-warning-soft px-4 py-2.5',
            !reply.failed && 'opacity-70',
            reply.failed && 'border-[1.5px] border-danger'
          )}>
          <View className="flex-row items-center gap-1.5">
            <Icon name="lock" size={14} colorClassName="accent-warning" />
            <Text variant="label" className="shrink">
              {title}
            </Text>
          </View>
          <Text variant="long" selectable>
            {reply.body}
          </Text>
        </View>
      </Lane>
      <PendingState reply={reply} state={state} {...actions} />
    </View>
  );
}

/**
 * Under what is on its way: "Sending…", or why it failed, with "Try again"
 * where trying again may work; where the store refused it for good, "Edit"
 * (back to the draft) and "Discard".
 */
function PendingState({
  reply,
  state,
  onRetry,
  onEdit,
  onDiscard,
}: PendingProps & {
  /** The word for where it stands: "Sending…", "Not sent". */
  state: string;
}) {
  const t = useTranslations('inbox.thread');
  const common = useTranslations('common');
  const describe = useErrorMessage();
  const reason = reply.failed ? describe(reply.error) : null;

  if (!reply.failed) {
    return (
      <Text variant="caption" className={cn('pe-10 pt-1', END)}>
        {state}
      </Text>
    );
  }
  return (
    <View className="items-end gap-1 pe-10 ps-10 pt-1">
      <View className="flex-row items-center gap-1">
        <Icon name="alert-circle" size={14} colorClassName="accent-danger" />
        <Text variant="caption" className={cn('text-danger', END)}>
          {state}
        </Text>
      </View>
      {reason ? (
        <Text variant="caption" className={cn('text-danger', END)}>
          {reason}
        </Text>
      ) : null}
      {canRetryReply(reply.error) ? (
        <TextLink label={common('retry')} onPress={onRetry} className="mt-1" />
      ) : (
        <View className="mt-1 flex-row gap-5">
          <TextLink label={t('editReply')} onPress={onEdit} />
          <TextLink label={t('discardReply')} onPress={onDiscard} />
        </View>
      )}
    </View>
  );
}

/** A reply on its way, drawn from the phone as the store will draw it once it arrives. */
function PendingReplyBubble({ reply, ...actions }: PendingProps) {
  const t = useTranslations('inbox.thread');
  const state = reply.failed ? t('notSent') : t('sending');
  // What is on its way is shown from the phone, as the store will draw it once it arrives.
  const picture = reply.file?.mimeType.startsWith('image/') ? reply.file : null;
  const file = reply.file && !picture ? reply.file : null;

  return (
    <View className="pt-1" accessibilityLiveRegion="polite">
      <View className={cn('gap-1', !reply.failed && 'opacity-70')}>
        {picture ? (
          <Lane side="end" picture={null}>
            <Pictures
              pictures={[
                {
                  type: 'image',
                  url: picture.previewUri ?? '',
                  name: picture.filename,
                  size: picture.size,
                },
              ]}
              label={[state, picture.filename].join(', ')}
              local
              className={reply.failed ? 'border-[1.5px] border-danger' : undefined}
            />
          </Lane>
        ) : null}
        {reply.body || file ? (
          <Lane side="end" picture={null}>
            <View
              accessible
              accessibilityLabel={[state, file?.filename, reply.body].filter(Boolean).join(', ')}
              className={cn(
                'shrink gap-2 rounded-[20px] bg-primary px-4 py-2.5',
                reply.failed && 'border-[1.5px] border-danger'
              )}>
              {file ? (
                <Files
                  files={[
                    {
                      type: 'document',
                      url: file.previewUri ?? '',
                      name: file.filename,
                      size: file.size,
                    },
                  ]}
                  onPrimary
                  local
                />
              ) : null}
              {reply.body ? (
                <Text variant="long" selectable className="text-primary-foreground">
                  {reply.body}
                </Text>
              ) : null}
            </View>
          </Lane>
        ) : null}
        {reply.product ? (
          <View className="pt-1">
            <SharedProductCard product={reply.product} />
          </View>
        ) : null}
      </View>
      <PendingState reply={reply} state={state} {...actions} />
    </View>
  );
}

/** A picture by its address, in the three sizes `AppImage` takes. */
function imageOf(url: string, alt?: string) {
  return { thumb: url, card: url, full: url, ...(alt ? { alt } : {}) };
}

/** "1.2 MB", "340 KB": a file's size in the operator's language. */
export function useFileSize(): (bytes: number | undefined) => string | null {
  const t = useTranslations('inbox.thread');
  const format = useFormatter();

  return (bytes) => {
    if (bytes === undefined || bytes < 0) return null;
    if (bytes >= 1024 * 1024) {
      return t('sizeMb', {
        size: format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }),
      });
    }
    return t('sizeKb', { size: format.number(Math.max(1, Math.round(bytes / 1024))) });
  };
}

/**
 * A message's pictures, on their own rather than in its bubble, so no band of
 * colour frames them: one as a 224 pt square, more two across (an odd last one
 * across both). A hairline keeps a white picture apart from the page. Each
 * opens full screen (`/viewer`).
 */
function Pictures({
  pictures,
  style,
  className,
  label,
  local = false,
}: {
  pictures: MessageAttachment[];
  /** The sharp corner by the sender's picture. */
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** What a screen reader says of a picture still on its way, which does not open. */
  label?: string;
  /** Still on the phone, on its way: shown, not opened. */
  local?: boolean;
}) {
  const t = useTranslations('inbox.thread');
  const openPicture = useOpenPicture();
  const alone = pictures.length === 1;

  return (
    <View
      style={style}
      className={cn(
        'w-[224px] flex-row flex-wrap gap-0.5 overflow-hidden rounded-[20px] border border-border bg-border',
        className
      )}>
      {pictures.map((picture, index) => {
        const wide = !alone && index === pictures.length - 1 && pictures.length % 2 === 1;
        return (
          <Pressable
            key={`${picture.url}-${index}`}
            accessibilityRole="imagebutton"
            accessibilityLabel={label ?? t('openPicture')}
            disabled={local || !picture.url}
            onPress={() => openPicture(picture.url, picture.name)}
            className={cn('active:opacity-80', alone || wide ? 'w-full' : 'w-[110px]')}>
            <AppImage
              image={imageOf(picture.url, picture.name)}
              size="card"
              decorative
              aspectRatio={wide ? 2 : 1}
              // The frame shows while the picture loads.
              className="w-full bg-surface-alt"
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Files that came with a message, each a row with its name and size. Each opens in the app's web page. */
function Files({
  files,
  onPrimary = false,
  local = false,
}: {
  files: MessageAttachment[];
  onPrimary?: boolean;
  /** Still on the phone, on its way: shown, not opened. */
  local?: boolean;
}) {
  const t = useTranslations('inbox.thread');
  const size = useFileSize();
  const openPage = useOpenPage();
  if (files.length === 0) return null;

  return (
    <View className="gap-2">
      {files.map((file, index) => (
        <Pressable
          key={`${file.url}-${index}`}
          accessibilityRole="link"
          accessibilityLabel={t('openFile', { name: file.name ?? t('file') })}
          disabled={local || !file.url}
          onPress={() => openPage(file.url, file.name ?? t('file'))}
          className="min-h-11 flex-row items-center gap-2 active:opacity-70">
          <Icon
            name="paperclip"
            size={18}
            colorClassName={onPrimary ? 'accent-primary-foreground' : 'accent-foreground'}
          />
          <View className="shrink">
            <Text
              variant="label"
              numberOfLines={1}
              className={onPrimary ? 'text-primary-foreground' : undefined}>
              {file.name ?? t('file')}
            </Text>
            {size(file.size) ? (
              <Text variant="caption" className={onPrimary ? 'text-primary-foreground' : undefined}>
                {size(file.size)}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Media an external channel delivered, which only the website can open: how
 * many, and a way to the website. The whole line opens it.
 */
function WebOnly({
  count,
  onOpenWebsite,
  onPrimary = false,
}: {
  count: number | undefined;
  onOpenWebsite?: () => void;
  onPrimary?: boolean;
}) {
  const t = useTranslations('inbox.thread');
  const common = useTranslations('common');
  if (!count) return null;
  const label = t('webOnly', { count });
  const tint = onPrimary ? 'accent-primary-foreground' : 'accent-link';

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={onOpenWebsite ? `${label}, ${common('openWebsite')}` : label}
      disabled={!onOpenWebsite}
      onPress={onOpenWebsite}
      className="min-h-11 flex-row items-center gap-2 active:opacity-70">
      <Icon name="paperclip" size={16} colorClassName={tint} />
      <View className="shrink">
        <Text variant="meta" className={onPrimary ? 'text-primary-foreground' : 'text-foreground'}>
          {label}
        </Text>
        {onOpenWebsite ? (
          <Text
            variant="label"
            className={cn('underline', onPrimary ? 'text-primary-foreground' : 'text-link')}>
            {common('openWebsite')}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

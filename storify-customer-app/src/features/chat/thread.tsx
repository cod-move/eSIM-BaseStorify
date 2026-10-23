import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useFormatter, useNow, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { TopFade } from '@/components/ui/edge-fade';
import { Icon } from '@/components/ui/icon';
import { ImageViewer } from '@/components/ui/image-viewer';
import { Text } from '@/components/ui/text';
import type {
  ChatAttachment,
  ChatMessage,
  ChatMessagePage,
  ChatMessageProduct,
  ChatProduct,
  ImageSet,
} from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { isImageFile, type PendingMessage } from './attachment';
import { ChatAvatar } from './chat-avatar';
import { useParty, type ChatParties } from './parties';
import { SharedProduct } from './shared-product';

type ThreadProps = {
  page: ChatMessagePage;
  /** The message on its way to the store, shown at once. */
  pending: PendingMessage | null;
  parties: ChatParties;
};

/** Bubbles are 20 pt round (`rounded-[20px]`), but the corner by the sender's picture is 6. */
const SENDER_CORNER = 6;

/**
 * Messages further apart than this start a run of their own, with the
 * picture and their own time: a message an hour later is not read as part of
 * what came before.
 */
const RUN_GAP_MS = 5 * 60 * 1000;

/**
 * A message that is only a shared product (no text of its own, or only the
 * product's link; no files): a card across the thread with no picture beside
 * it. It ends its run, and the message after it starts one, with the picture.
 */
function onlyProduct(message: ChatMessage): boolean {
  return (
    message.product !== undefined &&
    (!message.body || message.bodyIsFallback === true) &&
    message.attachments.length === 0
  );
}

/** Width of a 32 pt picture and the gap after it: what a message without a picture leaves free. */
const PICTURE_SPACE = 'w-8';

type Row = {
  message: ChatMessage;
  /** The first of a run of messages from one side on one day: it gets the picture. */
  startsRun: boolean;
  /** The last of its run: it gets the time. */
  endsRun: boolean;
  /** Set on the first message of a day: the day's heading, above it. */
  day: string | null;
};

/**
 * The messages, the newest at the bottom, and the product the chat is about
 * above the first of them. The list is inverted: the page is the newest first.
 * Messages from the same side a few minutes apart at most run together under
 * one picture and one time; each day has a heading.
 */
export function Thread({ page, pending, parties }: ThreadProps) {
  const format = useFormatter();
  const now = useNow();
  const t = useTranslations('chat');
  const { product } = page.conversation;
  const party = useParty(page.conversation, parties);

  const rows = useMemo(() => {
    const dayOf = (iso: string) =>
      format.dateTime(new Date(iso), { year: 'numeric', month: 'numeric', day: 'numeric' });
    const today = dayOf(now.toISOString());
    const yesterday = dayOf(new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString());
    const heading = (iso: string) => {
      const day = dayOf(iso);
      if (day === today) return t('today');
      if (day === yesterday) return t('yesterday');
      return format.dateTime(new Date(iso), { dateStyle: 'medium' });
    };

    // The page is newest first, so the message before one in time is the next in the array.
    return page.items.map<Row>((message, index) => {
      const older = page.items[index + 1];
      const newer = page.items[index - 1];
      const together = (other: ChatMessage) =>
        other.fromShopper === message.fromShopper &&
        dayOf(other.createdAt) === dayOf(message.createdAt) &&
        Math.abs(Date.parse(other.createdAt) - Date.parse(message.createdAt)) <= RUN_GAP_MS;
      // The text on its way follows the shopper's newest message without a time in between.
      const pendingFollows = index === 0 && pending !== null && message.fromShopper;
      return {
        message,
        startsRun: !older || !together(older) || onlyProduct(older),
        endsRun: onlyProduct(message) || (!pendingFollows && (!newer || !together(newer))),
        day:
          !older || dayOf(older.createdAt) !== dayOf(message.createdAt)
            ? heading(message.createdAt)
            : null,
      };
    });
  }, [format, now, page.items, pending, t]);

  const newest = page.items[0];
  const lastIsMine = newest?.fromShopper === true && !onlyProduct(newest);

  return (
    <View className="flex-1">
      <FlatList
        inverted
        data={rows}
        keyExtractor={(row) => row.message.id}
        className="flex-1"
        // Inverted, the bottom padding is at the top: room for the fade under the header.
        contentContainerClassName="px-4 pb-7 pt-2"
        ListHeaderComponent={
          pending === null ? null : (
            <PendingBubble pending={pending} parties={parties} continues={lastIsMine} />
          )
        }
        ListFooterComponent={product ? <ProductCard product={product} /> : null}
        renderItem={({ item }) => <MessageRow row={item} parties={parties} party={party} />}
      />
      {/* What scrolls up under the header fades into the page instead of being cut off. */}
      <TopFade />
    </View>
  );
}

type PartyView = ReturnType<typeof useParty>;

function MessageRow({ row, parties, party }: { row: Row; parties: ChatParties; party: PartyView }) {
  const format = useFormatter();
  const { message, startsRun, endsRun, day } = row;
  const mine = message.fromShopper;
  const time = format.dateTime(new Date(message.createdAt), { timeStyle: 'short' });

  return (
    <View>
      {day ? <DayHeading label={day} /> : null}
      <View className={startsRun ? 'pt-3' : 'pt-1'}>
        <Entry
          mine={mine}
          first={startsRun}
          // A body that is only the product's name and link stands in for the card, which is drawn.
          body={message.product && message.bodyIsFallback ? '' : message.body}
          product={message.product}
          attachments={message.attachments}
          picture={
            !startsRun ? (
              <View className={PICTURE_SPACE} />
            ) : mine ? (
              <ChatAvatar name={parties.shopper.name} image={parties.shopper.image} size="sm" />
            ) : (
              <ChatAvatar name={party.name} image={party.picture} brand size="sm" />
            )
          }
        />
        {endsRun ? (
          <View className={cn('pt-1', mine ? 'items-end pe-10' : 'items-start ps-10')}>
            <Text variant="caption">{time}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** "Today", "Yesterday" or the date, centred above the day's first message. */
function DayHeading({ label }: { label: string }) {
  return (
    <View className="items-center pb-1 pt-4">
      <Text variant="caption" accessibilityRole="header">
        {label}
      </Text>
    </View>
  );
}

type EntryProps = {
  mine: boolean;
  /** The first of its run: the picture, and the sharper corner by it. */
  first: boolean;
  body: string;
  product: ChatMessageProduct | undefined;
  attachments: ChatAttachment[];
  /** The sender's picture, or the space it leaves on a run's later messages. */
  picture: ReactNode;
};

/**
 * One message: its files and its text in a bubble beside the sender's
 * picture, and the product it shares under it, as a card across the thread.
 * A product shared on its own is only its card.
 */
function Entry({ mine, first, body, product, attachments, picture }: EntryProps) {
  const bubble = Boolean(body) || attachments.length > 0;

  return (
    <>
      {bubble ? (
        <View className={cn('flex-row items-start gap-2', mine ? 'justify-end ps-10' : 'pe-10')}>
          {mine ? null : picture}
          <MessageContent mine={mine} first={first} body={body} attachments={attachments} />
          {mine ? picture : null}
        </View>
      ) : null}
      {product ? (
        <View className={bubble ? 'pt-2' : undefined}>
          <SharedProduct product={product} />
        </View>
      ) : null}
    </>
  );
}

type MessageContentProps = {
  mine: boolean;
  /** The first of its run: the corner by the sender's picture is sharper. */
  first: boolean;
  body: string;
  attachments: ChatAttachment[];
};

/** A picture that came with a message: its prepared sizes, else its own address for each. */
function pictureOf(attachment: ChatAttachment): ImageSet {
  return (
    attachment.image ?? {
      thumb: attachment.url,
      card: attachment.url,
      full: attachment.url,
      ...(attachment.name ? { alt: attachment.name } : {}),
    }
  );
}

/**
 * A message's bubble: its files, then its text. A picture opens full screen in
 * the app, where the message's other pictures are a swipe away.
 */
function MessageContent({ mine, first, body, attachments }: MessageContentProps) {
  const [viewing, setViewing] = useState<number | null>(null);
  const pictures = attachments.filter((attachment) => attachment.type === 'image');
  const corner = first
    ? mine
      ? { borderTopEndRadius: SENDER_CORNER }
      : { borderTopStartRadius: SENDER_CORNER }
    : undefined;

  return (
    <View
      className={cn(
        'shrink gap-2 rounded-[20px] px-4 py-2.5',
        mine ? 'bg-primary' : 'bg-surface-alt'
      )}
      style={corner}>
      {attachments.map((attachment) => (
        <Attachment
          key={attachment.url}
          attachment={attachment}
          mine={mine}
          onOpenPicture={() => setViewing(pictures.indexOf(attachment))}
        />
      ))}
      {body ? <Text className={mine ? 'text-primary-foreground' : undefined}>{body}</Text> : null}
      <ImageViewer
        images={pictures.map(pictureOf)}
        initialIndex={viewing ?? 0}
        visible={viewing !== null}
        onClose={() => setViewing(null)}
      />
    </View>
  );
}

/**
 * What came with a message: a picture as a thumbnail, which opens full screen
 * in the app, or any other file as a row with its name, which opens in the
 * browser.
 */
function Attachment({
  attachment,
  mine,
  onOpenPicture,
}: {
  attachment: ChatAttachment;
  mine: boolean;
  onOpenPicture: () => void;
}) {
  const t = useTranslations('chat');
  if (attachment.type === 'image') {
    return (
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={t('openPicture')}
        onPress={onOpenPicture}
        className="active:opacity-80">
        <AppImage
          image={pictureOf(attachment)}
          size="card"
          decorative
          className="h-32 w-44 rounded-xl"
        />
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('openFile', { name: attachment.name ?? t('file') })}
      onPress={() => void openBrowserAsync(attachment.url)}
      className="min-h-11 flex-row items-center gap-2 active:opacity-70">
      <Icon
        name="link"
        size={18}
        colorClassName={mine ? 'accent-primary-foreground' : 'accent-foreground'}
      />
      <Text
        variant="label"
        numberOfLines={1}
        className={cn('shrink', mine && 'text-primary-foreground')}>
        {attachment.name ?? t('file')}
      </Text>
    </Pressable>
  );
}

/**
 * The shopper's message before the store has taken it: its text, and the
 * product or the file it carries, the file shown from the phone.
 */
function PendingBubble({
  pending,
  parties,
  continues,
}: {
  pending: PendingMessage;
  parties: ChatParties;
  /** It follows another of the shopper's messages, so the picture is already there. */
  continues: boolean;
}) {
  const t = useTranslations('chat');
  const { body, attachment } = pending;
  const file = attachment?.kind === 'file' ? attachment.file : undefined;
  const local: ChatAttachment[] = file
    ? [
        {
          type: isImageFile(file) ? 'image' : 'document',
          url: file.uri,
          name: file.name,
          mimeType: file.type,
        },
      ]
    : [];

  return (
    <View className={continues ? 'pt-1' : 'pt-3'} accessibilityLiveRegion="polite">
      <View className="opacity-70">
        <Entry
          mine
          first={!continues}
          body={body}
          product={attachment?.kind === 'product' ? attachment.product : undefined}
          attachments={local}
          picture={
            continues ? (
              <View className={PICTURE_SPACE} />
            ) : (
              <ChatAvatar name={parties.shopper.name} image={parties.shopper.image} size="sm" />
            )
          }
        />
      </View>
      <View className="items-end pe-10 pt-1">
        <Text variant="caption">{t('sending')}</Text>
      </View>
    </View>
  );
}

/** What the chat is about: its picture, name and chosen option. Opens the product. */
function ProductCard({ product }: { product: ChatProduct }) {
  const t = useTranslations('chat');
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('openProduct', { name: product.name })}
      onPress={() => router.push({ pathname: '/products/[slug]', params: { slug: product.slug } })}
      className="mb-2 min-h-11 flex-row items-center gap-3 rounded-[20px] border border-transparent bg-surface p-2 pe-4 shadow-card active:opacity-80 dark:border-border">
      <View className="size-20 overflow-hidden rounded-2xl bg-surface-alt">
        {product.image ? (
          <AppImage
            image={product.image}
            size="thumb"
            contentFit="contain"
            decorative
            className="size-full bg-surface-alt"
          />
        ) : null}
      </View>
      <View className="flex-1 gap-1">
        <Text variant="subheading" numberOfLines={2}>
          {product.name}
        </Text>
        {product.variantName ? (
          <Text variant="caption" numberOfLines={1}>
            {product.variantName}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={20} directional colorClassName="accent-muted" />
    </Pressable>
  );
}

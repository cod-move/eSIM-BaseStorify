import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconCircle, type IconCircleTone } from '@/components/ui/icon-circle';
import { Price } from '@/components/ui/price';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { AttachmentPolicy, ProductCard } from '@/contracts/mobile/shop/v1';
import { usePaused, useSearchSuggestions } from '@/features/search/use-search';
import { useErrorMessage } from '@/i18n/use-error-message';

import {
  pickDocument,
  pickPhoto,
  sharedProductOf,
  takePhoto,
  takesImages,
  type MessageAttachment,
  type PickProblem,
  type PickResult,
} from './attachment';

type AttachSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** What files the conversation takes. Without it, only a product can be shared. */
  policy: AttachmentPolicy | undefined;
  onAttach: (attachment: MessageAttachment) => void;
  /** A picked file the conversation would refuse, or a camera that is not allowed. */
  onProblem: (problem: PickProblem) => void;
};

/**
 * What can go with a message: a photo from the library or the camera (when
 * the conversation takes pictures), a file (when it takes files), or a product
 * of the catalog, found by its name. A file is checked against the
 * conversation's policy before it is attached; the store checks it again.
 *
 * The sheet stays open while the phone's picker is up, and closes once a file
 * is chosen: closing it first would take the picker down with it.
 */
export function AttachSheet({ visible, onClose, policy, onAttach, onProblem }: AttachSheetProps) {
  const t = useTranslations('chat');
  const [view, setView] = useState<'menu' | 'product'>('menu');

  const close = () => {
    onClose();
    setView('menu');
  };

  const pick = async (picker: (policy: AttachmentPolicy) => Promise<PickResult>) => {
    if (!policy) return;
    const result = await picker(policy);
    if (!result) return;
    close();
    if ('attachment' in result) onAttach(result.attachment);
    else onProblem(result.problem);
  };

  return (
    <Sheet
      visible={visible}
      title={view === 'menu' ? t('attachTitle') : t('attachProduct')}
      onClose={close}
      onBack={view === 'product' ? () => setView('menu') : undefined}
      size={view === 'product' ? 'tall' : 'fit'}>
      {view === 'menu' ? (
        <View className="gap-1">
          {takesImages(policy) ? (
            <>
              <AttachOption
                icon="image"
                tone="success"
                title={t('attachPhoto')}
                hint={t('attachPhotoHint')}
                onPress={() => void pick(pickPhoto)}
              />
              <AttachOption
                icon="camera"
                tone="warning"
                title={t('attachCamera')}
                hint={t('attachCameraHint')}
                onPress={() => void pick(takePhoto)}
              />
            </>
          ) : null}
          {policy ? (
            <AttachOption
              icon="paperclip"
              tone="neutral"
              title={t('attachFile')}
              hint={t('attachFileHint')}
              onPress={() => void pick(pickDocument)}
            />
          ) : null}
          <AttachOption
            icon="package"
            tone="accent"
            title={t('attachProduct')}
            hint={t('attachProductHint')}
            leadsOn
            onPress={() => setView('product')}
          />
        </View>
      ) : (
        <ProductSearch
          onChoose={(card) => {
            close();
            onAttach({ kind: 'product', product: sharedProductOf(card) });
          }}
        />
      )}
    </Sheet>
  );
}

type AttachOptionProps = {
  icon: IconName;
  tone: IconCircleTone;
  title: string;
  /** A line on what it adds, under the title. */
  hint: string;
  /** It opens another step of the sheet (the product search): a chevron says so. */
  leadsOn?: boolean;
  onPress: () => void;
};

/**
 * One way to add to a message: a tinted icon, what it adds and a line on it.
 * The rows sit straight on the sheet, with no lines between them; a pressed
 * row takes a quiet fill. The business app's attach sheet is drawn the same way.
 */
function AttachOption({ icon, tone, title, hint, leadsOn = false, onPress }: AttachOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      className="-mx-3 min-h-16 flex-row items-center gap-3.5 rounded-2xl px-3 py-2.5 active:bg-surface-alt">
      <IconCircle icon={icon} tone={tone} />
      <View className="flex-1 gap-0.5">
        <Text variant="label">{title}</Text>
        <Text className="text-[13px] leading-[18px] text-muted">{hint}</Text>
      </View>
      {leadsOn ? (
        <Icon name="chevron-right" size={20} colorClassName="accent-muted" directional />
      ) : null}
    </Pressable>
  );
}

/** The catalog, searched by name as the shopper types; a match is shared with a tap. */
function ProductSearch({ onChoose }: { onChoose: (card: ProductCard) => void }) {
  const t = useTranslations('chat');
  const describe = useErrorMessage();
  const [term, setTerm] = useState('');
  const searched = usePaused(term.trim());
  const matches = useSearchSuggestions(searched);

  const body = () => {
    if (!searched) return <Text className="text-muted">{t('productSearchHint')}</Text>;
    if (matches.isError) {
      return (
        <Text accessibilityRole="alert" className="text-danger">
          {describe(matches.error)}
        </Text>
      );
    }
    if (!matches.data) return null;
    if (matches.data.items.length === 0) {
      return <Text className="text-muted">{t('productSearchEmpty')}</Text>;
    }
    return matches.data.items.map((card) => (
      <Pressable
        key={card.id}
        accessibilityRole="button"
        accessibilityLabel={t('shareProduct', { name: card.name })}
        onPress={() => onChoose(card)}
        className="min-h-16 flex-row items-center gap-3 py-2 active:opacity-70">
        <View className="size-14 overflow-hidden rounded-xl bg-surface-alt">
          {card.image ? (
            <AppImage
              image={card.image}
              size="thumb"
              contentFit="contain"
              decorative
              className="size-full"
            />
          ) : null}
        </View>
        <View className="flex-1 gap-1">
          <Text variant="label" numberOfLines={2}>
            {card.name}
          </Text>
          <Price
            price={card.price}
            compareAt={card.compareAtPrice}
            from={card.priceVaries}
            onRequest={card.priceOnRequest}
          />
        </View>
      </Pressable>
    ));
  };

  return (
    <View className="gap-4">
      <SearchField
        label={t('productSearchLabel')}
        placeholder={t('productSearchLabel')}
        value={term}
        onChangeText={setTerm}
        autoFocus
      />
      <View>{body()}</View>
    </View>
  );
}

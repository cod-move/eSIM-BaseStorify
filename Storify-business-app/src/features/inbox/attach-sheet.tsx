import { useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconCircle } from '@/components/ui/icon-circle';
import { GroupFootnote, ListRow, RowGroup } from '@/components/ui/rows';
import { SearchField } from '@/components/ui/search-field';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import type { StatusTone } from '@/components/ui/status-chip';
import { Text } from '@/components/ui/text';
import type { AttachmentPolicy, ProductListItem } from '@/contracts/mobile/biz/v1';
import { useProducts } from '@/features/products/use-products';
import type { UploadFileSource } from '@/features/uploads/pick-asset';
import { selectUploadFile } from '@/features/uploads/select-file';
import {
  UploadSelectionError,
  type SelectedUploadFile,
  type UploadLimits,
} from '@/features/uploads/selected-file';
import { useOpenDashboard } from '@/features/web/use-open-page';
import { useCan } from '@/features/workspace/use-workspace';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import type { ReplyProduct } from './thread-rows';

/** What a conversation's channel takes, as the picker's filter: every type, up to the largest size. */
function limitsOf(policy: AttachmentPolicy): UploadLimits {
  return {
    maxBytes: Math.max(...policy.types.map((type) => type.maxBytes)),
    mimeTypes: policy.types.map((type) => type.mimeType),
  };
}

/** The picked file, held to its own type's size (the filter allowed the largest of any). */
function withinPolicy(file: SelectedUploadFile, policy: AttachmentPolicy): SelectedUploadFile {
  const type = policy.types.find((candidate) => candidate.mimeType === file.mimeType);
  if (!type) throw new UploadSelectionError('unsupportedType');
  if (file.size > type.maxBytes) throw new UploadSelectionError('tooLarge');
  return file;
}

/** A product as a reply shares it: its price in the store's words (lowest to highest, with variants). */
function useReplyProduct(): (product: ProductListItem) => ReplyProduct {
  const t = useTranslations('inbox.attach');
  return (product) => ({
    id: product.id,
    name: product.name,
    ...(product.image ? { image: product.image } : {}),
    ...(product.price
      ? {
          price: product.maxPrice
            ? t('priceRange', { from: product.price.formatted, to: product.maxPrice.formatted })
            : product.price.formatted,
        }
      : {}),
  });
}

type AttachSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** What files the conversation takes; absent when it takes none. */
  policy?: AttachmentPolicy;
  /** A product the reply shares. */
  onProduct: (product: ReplyProduct) => void;
  /** A file the reply carries. */
  onFile: (file: SelectedUploadFile) => void;
  /** A file could not be taken: why. */
  onFileError: (error: unknown) => void;
  /** Writes a note for the team instead, where the store offers `note`. */
  onNote?: () => void;
};

/**
 * What the composer's attach button offers, in one bottom sheet: a photo from
 * the library or the camera and a file (each of a type the conversation's
 * channel takes), and a product to share, found by a search. Each goes onto
 * the reply, to send with its text. A channel that takes no files keeps the
 * way to the website for them. Last, apart from what goes to the customer, an
 * internal note for the team, where the store offers one.
 */
export function AttachSheet({
  visible,
  onClose,
  policy,
  onProduct,
  onFile,
  onFileError,
  onNote,
}: AttachSheetProps) {
  const t = useTranslations('inbox.attach');
  const common = useTranslations('common');
  const canProducts = useCan('VIEW_PRODUCTS');
  const [mode, setMode] = useState<'menu' | 'product'>('menu');
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim().slice(0, 100));
  const replyProduct = useReplyProduct();
  // The picker waits for the sheet to leave: iOS shows one modal at a time.
  const source = useRef<UploadFileSource | null>(null);
  // So does the note's composer, which takes the place of the one this sheet belongs to.
  const noting = useRef(false);
  const openDashboard = useOpenDashboard();
  const photos = policy?.types.some((type) => type.mimeType.startsWith('image/')) ?? false;

  const close = () => {
    onClose();
    setMode('menu');
    setSearch('');
  };

  const pick = async (from: UploadFileSource) => {
    if (!policy) return;
    try {
      const file = await selectUploadFile(from, limitsOf(policy));
      if (file) onFile(withinPolicy(file, policy));
    } catch (error) {
      onFileError(error);
    }
  };

  const choose = (from: UploadFileSource) => {
    // A browser opens its picker only from the tap itself.
    if (Platform.OS === 'web') void pick(from);
    else source.current = from;
    close();
  };

  return (
    <Sheet
      visible={visible}
      title={t(mode === 'product' ? 'productTitle' : 'title')}
      onClose={close}
      onClosed={() => {
        const from = source.current;
        source.current = null;
        if (from) void pick(from);
        if (noting.current) {
          noting.current = false;
          onNote?.();
        }
      }}>
      {mode === 'menu' ? (
        <View className="gap-1">
          {policy && photos ? (
            <>
              <AttachOption
                icon="image"
                tone="success"
                title={t('photo')}
                hint={t('photoHint')}
                onPress={() => choose('photo-library')}
              />
              <AttachOption
                icon="camera"
                tone="warning"
                title={t('camera')}
                hint={t('cameraHint')}
                onPress={() => choose('camera')}
              />
            </>
          ) : null}
          {policy ? (
            <AttachOption
              icon="paperclip"
              tone="neutral"
              title={t('file')}
              hint={t('fileHint')}
              onPress={() => choose('document')}
            />
          ) : null}
          {canProducts ? (
            <AttachOption
              icon="package"
              tone="info"
              title={t('product')}
              hint={t('productHint')}
              leadsOn
              onPress={() => setMode('product')}
            />
          ) : null}
          {!policy && openDashboard ? (
            <AttachOption
              icon="image"
              tone="neutral"
              title={t('mediaOnWebsite')}
              hint={t('mediaHint')}
              leadsOn
              onPress={() => {
                close();
                openDashboard();
              }}
            />
          ) : null}
          {!policy && !openDashboard ? (
            <GroupFootnote text={t('mediaHint')} className="px-0" />
          ) : null}
          {onNote ? (
            <>
              {/* Apart from what goes to the customer. */}
              <View className="my-2 h-px bg-border" />
              <AttachOption
                icon="lock"
                tone="warning"
                title={t('note')}
                hint={t('noteHint')}
                onPress={() => {
                  noting.current = true;
                  close();
                }}
              />
            </>
          ) : null}
        </View>
      ) : (
        <ProductSearch
          search={search}
          term={term}
          onSearch={setSearch}
          onBack={() => setMode('menu')}
          backLabel={common('back')}
          onPick={(product) => {
            onProduct(replyProduct(product));
            close();
          }}
        />
      )}
    </Sheet>
  );
}

type AttachOptionProps = {
  icon: IconName;
  tone: StatusTone;
  title: string;
  /** A line on what it adds, under the title. */
  hint: string;
  /** It goes on to another step (the product search, the website): a chevron says so. */
  leadsOn?: boolean;
  onPress: () => void;
};

/**
 * One way to add to a reply: a tinted icon, what it
 * adds and a line on it. The rows sit straight on the sheet, with no lines
 * between them; a pressed row takes a quiet fill. The shopper app's attach
 * sheet is drawn the same way.
 */
function AttachOption({ icon, tone, title, hint, leadsOn = false, onPress }: AttachOptionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      onPress={onPress}
      className="-mx-3 min-h-16 flex-row items-center gap-3.5 rounded-2xl px-3 py-2.5 active:bg-surface-alt">
      <IconCircle icon={icon} tone={tone} size="md" />
      <View className="flex-1 gap-0.5">
        <Text variant="label">{title}</Text>
        <Text variant="meta">{hint}</Text>
      </View>
      {leadsOn ? (
        <Icon name="chevron-right" size={20} colorClassName="accent-muted" directional />
      ) : null}
    </Pressable>
  );
}

function ProductSearch({
  search,
  term,
  onSearch,
  onBack,
  backLabel,
  onPick,
}: {
  search: string;
  term: string;
  onSearch: (text: string) => void;
  onBack: () => void;
  backLabel: string;
  onPick: (product: ProductListItem) => void;
}) {
  const t = useTranslations('inbox.attach');
  const common = useTranslations('common');
  const products = useProducts({ search: term || undefined, status: 'active' });
  const items = products.data ?? [];

  return (
    <View className="gap-3">
      <Button
        label={backLabel}
        icon="arrow-left"
        variant="ghost"
        size="sm"
        className="self-start"
        onPress={onBack}
      />
      <SearchField label={t('searchProducts')} value={search} onChangeText={onSearch} autoFocus />
      {products.isPending ? (
        <LoadingState shape="rows" />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon="package" placement="top" title={t('noProducts')} />
      ) : (
        <RowGroup bare divider="leading">
          {items.map((product) => (
            <ListRow
              key={product.id}
              leading={
                <AppImage
                  image={product.image}
                  size="thumb"
                  decorative
                  className="size-11 rounded-md bg-surface-alt"
                />
              }
              title={product.name}
              titleEnd={
                product.price ? <Text variant="price">{product.price.formatted}</Text> : undefined
              }
              meta={[product.sku, product.untracked ? null : t('inStock', { count: product.stock })]
                .filter(Boolean)
                .join(common('separator'))}
              accessibilityLabel={t('shareProduct', { name: product.name })}
              onPress={() => onPick(product)}
            />
          ))}
        </RowGroup>
      )}
    </View>
  );
}

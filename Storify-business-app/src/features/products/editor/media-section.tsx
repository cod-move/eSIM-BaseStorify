import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { BizUploadRequest, ProductMediaWriteRequest } from '@/contracts/mobile/biz/v1';
import { useUploadFile } from '@/features/uploads/use-upload';
import { useUploadErrorMessage } from '@/features/uploads/use-upload-error-message';
import { selectUploadFile } from '@/features/uploads/select-file';
import { useOpenPage } from '@/features/web/use-open-page';
import type { UploadFileSource } from '@/features/uploads/pick-asset';
import type { SelectedUploadFile } from '@/features/uploads/selected-file';
import { cn } from '@/lib/cn';

import { useDigitalAssetAccess } from '../use-product-editor';
import { EditorNumber } from './controls';
import { ChoiceChips, FormGroup } from '@/components/ui/form-sections';
import type { ProductEditorSectionProps } from './types';

/** Moves a media item to `target` and numbers every position again. */
export function orderedMedia(items: ProductMediaWriteRequest[], id: string, target: number) {
  const index = items.findIndex((item) => item.id === id);
  if (index < 0 || target < 0 || target >= items.length || target === index) return items;
  const ordered = [...items];
  const [moved] = ordered.splice(index, 1);
  ordered.splice(target, 0, moved!);
  return ordered.map((item, position) => ({ ...item, position }));
}

const SOURCES: { source: UploadFileSource; icon: IconName }[] = [
  { source: 'camera', icon: 'camera' },
  { source: 'photo-library', icon: 'image' },
  { source: 'document', icon: 'paperclip' },
];

const TYPE_ICONS: Record<ProductMediaWriteRequest['type'], IconName> = {
  image: 'image',
  video: 'eye',
  model: 'boxes',
  external_video: 'link',
};

function preview(item: ProductMediaWriteRequest) {
  const url = item.type === 'image' ? (item.url ?? item.thumbnailUrl) : item.thumbnailUrl;
  return url
    ? { thumb: url, card: url, full: url, alt: item.alt ?? item.filename ?? '' }
    : undefined;
}

export function MediaSection(props: ProductEditorSectionProps) {
  const t = useTranslations('products.editor');
  const format = useFormatter();
  const uploadText = useTranslations('uploads');
  const describe = useUploadErrorMessage();
  const uploader = useUploadFile();
  const [selected, setSelected] = useState<{
    request: BizUploadRequest;
    file: SelectedUploadFile;
  } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [picking, setPicking] = useState(false);
  const [external, setExternal] = useState('');
  const [asset, setAsset] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  }, [props]);
  const attached = useRef(new Set<string>());
  const phase = uploader.job.phase;
  // Only an upload on its way holds the editor. One stopped, unconfirmed or not
  // received waits for the operator's choice (send it again, check it, let it
  // go) without holding the rest of the product back.
  const pending = picking || phase === 'sending' || phase === 'reconciling';
  const { onPendingUploadChange } = props;
  useEffect(() => {
    onPendingUploadChange?.(pending);
  }, [pending, onPendingUploadChange]);
  const uploaded = uploader.job.upload;
  useEffect(() => {
    if (!uploaded || attached.current.has(uploaded.id)) return;
    attached.current.add(uploaded.id);
    const { values, onChange } = latest.current;
    if (uploaded.purpose === 'digital_asset') {
      const assets = values.digitalAssets ?? [];
      if (!assets.some((item) => item.id === uploaded.id))
        onChange({
          digitalAssets: [
            ...assets,
            {
              id: uploaded.id,
              uploadId: uploaded.id,
              filename: uploaded.filename,
              size: uploaded.size,
              mimeType: uploaded.mimeType,
              position: assets.length,
            },
          ],
        });
    } else if (uploaded.purpose === 'digital_preview') {
      onChange({
        digitalPreview: {
          uploadId: uploaded.id,
          filename: uploaded.filename,
          size: uploaded.size,
          mimeType: uploaded.mimeType,
        },
      });
    } else {
      const media = values.media ?? [];
      if (!media.some((item) => item.id === uploaded.id))
        onChange({
          media: [
            ...media,
            {
              id: uploaded.id,
              uploadId: uploaded.id,
              type: uploaded.mimeType.startsWith('video/')
                ? 'video'
                : uploaded.mimeType.startsWith('model/')
                  ? 'model'
                  : 'image',
              filename: uploaded.filename,
              mimeType: uploaded.mimeType,
              size: uploaded.size,
              ...(uploaded.url && !uploaded.private ? { url: uploaded.url } : {}),
              ...(uploaded.image?.thumb ? { thumbnailUrl: uploaded.image.thumb } : {}),
              position: media.length,
            },
          ],
        });
    }
  }, [uploaded]);
  const has = (key: keyof typeof props.values) => props.writableFields.includes(key);
  const locked = props.disabled || pending;
  const media = props.values.media ?? [];
  const assets = props.values.digitalAssets ?? [];
  const digital = props.values.shipping?.isPhysicalProduct === false;
  const limit = props.options.limits.media;
  const full = media.length >= limit;
  const canUpload = props.options.uploads.some((policy) => policy.purpose === 'product_media');
  const coverId = media.find((item) => item.type === 'image')?.id;
  const current = media.find((item) => item.id === editing);
  const currentIndex = current ? media.indexOf(current) : -1;
  async function pick(purpose: BizUploadRequest['purpose'], source: UploadFileSource) {
    const policy = props.options.uploads.find((item) => item.purpose === purpose);
    if (!policy || locked) return;
    setError(null);
    setPicking(true);
    try {
      const file = await selectUploadFile(source, policy);
      if (!file) return;
      const request: BizUploadRequest = {
        purpose,
        target: props.productId
          ? { kind: 'product', id: props.productId }
          : { kind: 'product_draft', id: props.draftId },
      };
      setSelected({ request, file });
      await uploader.submit(request, file);
    } catch (failure) {
      setError(failure);
    } finally {
      setPicking(false);
    }
  }
  async function retry() {
    if (!selected) return;
    setError(null);
    try {
      await uploader.submit(selected.request, selected.file);
    } catch (failure) {
      setError(failure);
    }
  }
  const replace = (id: string, changes: Partial<ProductMediaWriteRequest>) =>
    props.onChange({
      media: media.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    });
  const remove = (id: string) =>
    props.onChange({
      media: media
        .filter((item) => item.id !== id)
        .map((item, position) => ({ ...item, position })),
      ...(has('variants')
        ? {
            variants: props.values.variants?.map((variant) =>
              variant.mediaId === id
                ? { ...variant, mediaId: undefined, image: undefined }
                : variant
            ),
          }
        : {}),
    });
  const addExternal = () => {
    if (!external.trim() || full) return;
    props.onChange({
      media: [
        ...media,
        {
          id: `external-${Date.now()}`,
          type: 'external_video',
          url: external.trim(),
          position: media.length,
        },
      ],
    });
    setExternal('');
  };
  const showUpload = selected && phase !== 'uploaded' && phase !== 'idle';
  return (
    <>
      {error || uploader.job.error ? (
        <Banner tone="danger" message={describe(error ?? uploader.job.error)} />
      ) : null}
      {showUpload ? (
        <View className="flex-row items-center gap-3 rounded-lg bg-surface-alt p-3">
          {['sending', 'reconciling'].includes(phase) ? <ActivityIndicator /> : null}
          <View className="flex-1 gap-0.5">
            <Text variant="label" numberOfLines={1}>
              {selected.file.filename}
            </Text>
            <Text
              variant="meta"
              accessibilityRole={
                ['sending', 'reconciling'].includes(phase) ? 'progressbar' : undefined
              }>
              {uploadText(`phase.${phase}`)}
            </Text>
          </View>
          {phase === 'sending' ? (
            <Button label={t('cancelUpload')} variant="ghost" size="sm" onPress={uploader.cancel} />
          ) : null}
          {['unknown', 'cancelled', 'failed', 'notReceived'].includes(phase) ? (
            <View className="items-end">
              <Button
                label={t('retryUpload')}
                variant="ghost"
                size="sm"
                disabled={uploader.isPending}
                onPress={() => void retry()}
              />
              {phase !== 'notReceived' ? (
                <Button
                  label={t('checkUpload')}
                  variant="ghost"
                  size="sm"
                  disabled={uploader.isPending}
                  onPress={() => {
                    setError(null);
                    void uploader.reconcile().catch(setError);
                  }}
                />
              ) : null}
              <Button
                label={t('discardUpload')}
                variant="ghost"
                size="sm"
                disabled={uploader.isPending}
                onPress={() => {
                  setError(null);
                  setSelected(null);
                  uploader.discard();
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {has('media') ? (
        <FormGroup first>
          {media.length ? (
            <View className="flex-row flex-wrap gap-2">
              {media.map((item, index) => {
                const image = preview(item);
                const name = item.alt || item.filename || t(`mediaTypes.${item.type}`);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={t('editMedia', { index: index + 1, name })}
                    accessibilityHint={item.id === coverId ? t('cover') : undefined}
                    disabled={locked}
                    onPress={() => setEditing(item.id)}
                    className="aspect-square basis-[31.5%] overflow-hidden rounded-lg bg-surface-alt active:opacity-80">
                    {image ? (
                      <AppImage
                        image={image}
                        size="thumb"
                        decorative
                        contentFit={item.fit === 'contain' ? 'contain' : 'cover'}
                        className="size-full"
                      />
                    ) : (
                      <View className="size-full items-center justify-center gap-1 p-2">
                        <Icon name={TYPE_ICONS[item.type]} colorClassName="accent-muted" />
                        <Text variant="caption" numberOfLines={1}>
                          {t(`mediaTypes.${item.type}`)}
                        </Text>
                      </View>
                    )}
                    {item.id === coverId ? (
                      <View className="absolute bottom-1.5 start-1.5 rounded-full bg-surface px-2 py-0.5">
                        <Text variant="status">{t('cover')}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View className="items-center gap-3 rounded-lg border-[1.5px] border-dashed border-border px-4 py-5">
            <View className="items-center gap-1">
              <Text variant="label" className="text-center">
                {t(media.length ? 'addMoreMedia' : 'addMedia')}
              </Text>
              <Text variant="caption" className="text-center">
                {t('mediaCount', {
                  count: format.number(media.length),
                  max: format.number(limit),
                })}
              </Text>
            </View>
            <View className="flex-row flex-wrap justify-center gap-2">
              {SOURCES.map(({ source, icon }) => (
                <Button
                  key={source}
                  label={t(`sources.${source}`)}
                  icon={icon}
                  variant="secondary"
                  size="sm"
                  disabled={locked || full || !canUpload}
                  onPress={() => void pick('product_media', source)}
                />
              ))}
            </View>
          </View>
          <TextField
            label={t('externalVideo')}
            optional
            placeholder={t('externalVideoPlaceholder')}
            value={external}
            autoCapitalize="none"
            keyboardType="url"
            editable={!locked}
            onChangeText={setExternal}
            onSubmitEditing={addExternal}
            end={
              <Button
                label={t('add')}
                accessibilityLabel={t('addExternalVideo')}
                variant="ghost"
                size="sm"
                disabled={locked || !external.trim() || full}
                onPress={addExternal}
              />
            }
          />
        </FormGroup>
      ) : null}
      {digital && has('digitalAssets') ? (
        <FormGroup title={t('digitalAssets')} hint={t('privateAssetsHint')}>
          {assets.length ? (
            <View className="overflow-hidden rounded-lg border border-border">
              {assets.map((item, index) => (
                <View
                  key={item.id}
                  className={cn(
                    'min-h-14 flex-row items-center gap-3 ps-4 pe-1',
                    index > 0 && 'border-t border-border'
                  )}>
                  <Icon name="file-text" size={20} colorClassName="accent-muted" />
                  <View className="flex-1 py-3">
                    <Text variant="label" numberOfLines={1}>
                      {item.filename}
                    </Text>
                    {item.mimeType ? (
                      <Text variant="meta" numberOfLines={1}>
                        {item.mimeType}
                      </Text>
                    ) : null}
                  </View>
                  {props.productId ? (
                    <IconButton
                      icon="eye"
                      variant="plain"
                      label={t('openDigitalAsset', { filename: item.filename })}
                      disabled={locked}
                      onPress={() => setAsset(item.id)}
                    />
                  ) : null}
                  {index > 0 ? (
                    <IconButton
                      icon="arrow-up"
                      variant="plain"
                      label={t('moveAssetUp', { filename: item.filename })}
                      disabled={locked}
                      onPress={() => {
                        const ordered = [...assets];
                        [ordered[index - 1], ordered[index]] = [
                          ordered[index]!,
                          ordered[index - 1]!,
                        ];
                        props.onChange({
                          digitalAssets: ordered.map((entry, position) => ({ ...entry, position })),
                        });
                      }}
                    />
                  ) : null}
                  <IconButton
                    icon="trash"
                    variant="plain"
                    label={t('removeDigitalAsset', { filename: item.filename })}
                    disabled={locked}
                    onPress={() =>
                      props.onChange({
                        digitalAssets: assets
                          .filter((entry) => entry.id !== item.id)
                          .map((entry, position) => ({ ...entry, position })),
                      })
                    }
                  />
                </View>
              ))}
            </View>
          ) : null}
          <Button
            label={t('addDigitalAsset')}
            icon="plus"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={
              locked ||
              assets.length >= props.options.limits.digitalAssets ||
              !props.options.uploads.some((policy) => policy.purpose === 'digital_asset')
            }
            onPress={() => void pick('digital_asset', 'document')}
          />
          {has('digitalDelivery') ? (
            <EditorNumber
              label={t('downloadLimit')}
              value={props.values.digitalDelivery?.downloadLimit}
              integer
              optional
              hint={t('downloadLimitHint')}
              disabled={locked}
              onChange={(downloadLimit) =>
                props.onChange({
                  digitalDelivery: { ...props.values.digitalDelivery, downloadLimit },
                })
              }
            />
          ) : null}
        </FormGroup>
      ) : null}
      {digital && has('digitalPreview') ? (
        <FormGroup title={t('digitalPreview')} hint={t('digitalPreviewHint')}>
          {props.values.digitalPreview ? (
            <View className="min-h-14 flex-row items-center gap-3 rounded-lg border border-border ps-4 pe-1">
              <Icon name="eye" size={20} colorClassName="accent-muted" />
              <Text variant="label" numberOfLines={1} className="flex-1">
                {props.values.digitalPreview.filename ?? t('digitalPreview')}
              </Text>
              <IconButton
                icon="trash"
                variant="plain"
                label={t('removePreview')}
                disabled={locked}
                onPress={() => props.onChange({ digitalPreview: null })}
              />
            </View>
          ) : (
            <Button
              label={t('addPreview')}
              icon="plus"
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={
                locked ||
                !props.options.uploads.some((policy) => policy.purpose === 'digital_preview')
              }
              onPress={() => void pick('digital_preview', 'document')}
            />
          )}
        </FormGroup>
      ) : null}
      <Sheet
        visible={Boolean(current)}
        title={t('mediaDetails')}
        onClose={() => setEditing(null)}
        footer={<Button label={t('done')} variant="accent" onPress={() => setEditing(null)} />}>
        {current ? (
          <View className="gap-5">
            {preview(current) ? (
              <AppImage
                image={preview(current)}
                size="card"
                contentFit={current.fit === 'contain' ? 'contain' : 'cover'}
                className="aspect-square w-full rounded-lg bg-surface-alt"
              />
            ) : null}
            <TextField
              label={t('altText')}
              hint={t('mediaAltHint')}
              value={current.alt ?? ''}
              maxLength={1000}
              editable={!locked}
              onChangeText={(alt) => replace(current.id, { alt })}
            />
            <ChoiceChips
              label={t('fit')}
              value={current.fit ?? 'auto'}
              choices={(['auto', 'contain', 'cover'] as const).map((value) => ({
                value,
                label: t(`fits.${value}`),
              }))}
              disabled={locked}
              onChange={(fit) => replace(current.id, { fit })}
            />
            <View className="flex-row flex-wrap gap-2">
              {currentIndex > 0 ? (
                <Button
                  label={t('makeCover')}
                  variant="secondary"
                  size="sm"
                  disabled={locked}
                  onPress={() => props.onChange({ media: orderedMedia(media, current.id, 0) })}
                />
              ) : null}
              <Button
                label={t('moveEarlier')}
                variant="secondary"
                size="sm"
                disabled={locked || currentIndex <= 0}
                onPress={() =>
                  props.onChange({ media: orderedMedia(media, current.id, currentIndex - 1) })
                }
              />
              <Button
                label={t('moveLater')}
                variant="secondary"
                size="sm"
                disabled={locked || currentIndex >= media.length - 1}
                onPress={() =>
                  props.onChange({ media: orderedMedia(media, current.id, currentIndex + 1) })
                }
              />
            </View>
            <Button
              label={t('removeThisMedia')}
              icon="trash"
              variant="ghost"
              destructive
              disabled={locked}
              onPress={() => {
                setEditing(null);
                remove(current.id);
              }}
            />
          </View>
        ) : null}
      </Sheet>
      {asset && props.productId ? (
        <DigitalAssetOpener
          productId={props.productId}
          assetId={asset}
          filename={assets.find((item) => item.id === asset)?.filename}
          onDone={() => setAsset(null)}
          onError={setError}
        />
      ) : null}
    </>
  );
}

function DigitalAssetOpener({
  productId,
  assetId,
  filename,
  onDone,
  onError,
}: {
  productId: string;
  assetId: string;
  /** The header's title on the page the file opens in. */
  filename?: string;
  onDone: () => void;
  onError: (error: unknown) => void;
}) {
  const access = useDigitalAssetAccess(productId, assetId);
  const openPage = useOpenPage();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    if (access.error) {
      opened.current = true;
      onError(access.error);
      onDone();
    } else if (access.data && Date.parse(access.data.expiresAt) > Date.now()) {
      opened.current = true;
      openPage(access.data.url, filename);
      onDone();
    }
  }, [access.data, access.error, filename, onDone, onError, openPage]);
  return null;
}

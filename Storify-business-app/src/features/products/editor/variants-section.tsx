import * as Crypto from 'expo-crypto';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { ApiError } from '@/api/errors';
import { AppImage } from '@/components/ui/app-image';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ListRow, RowGroup } from '@/components/ui/rows';
import { SearchField } from '@/components/ui/search-field';
import { ConfirmSheet, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { ProductOption, ProductVariantWriteRequest } from '@/contracts/mobile/biz/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useGenerateProductVariants } from '../use-product-editor';
import { AttributeFields, BarcodeDetails, PreorderFields } from './business-sections';
import { EditorChoice, EditorNumber, EditorToggle } from './controls';
import { Disclosure, FormGroup, FieldRow, ValueChip } from '@/components/ui/form-sections';
import type { ProductEditorSectionProps } from './types';

/** How the storefront draws an option's values: the web dashboard's set. */
const VISUALS = ['rectangle', 'dropdown', 'circle', 'color', 'color_label', 'radio'] as const;
const COLOR = /^#[0-9a-f]{6}$/i;

const swatched = (option: ProductOption) =>
  option.visual === 'color' ||
  option.visual === 'color_label' ||
  (!option.visual && /^colou?r$/i.test(option.name.trim()));

export function VariantsSection(props: ProductEditorSectionProps) {
  const t = useTranslations('products.editor');
  const describe = useErrorMessage();
  const generate = useGenerateProductVariants();
  const [search, setSearch] = useState('');
  const [index, setIndex] = useState<number | null>(null);
  // The variant whose removal is being confirmed. Its confirm sheet opens once the
  // variant's sheet has gone, and "Keep" opens that sheet again once the confirm has:
  // iOS presents one modal at a time.
  const [remove, setRemove] = useState<number | null>(null);
  const asked = useRef<{ remove?: number; reopen?: number }>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [value, setValue] = useState<{ option: number; value: number } | null>(null);
  const options = props.values.options ?? [];
  const variants = props.values.variants ?? [];
  const canOptions = props.writableFields.includes('options');
  const canVariants = props.writableFields.includes('variants');
  const disabled = props.disabled || generate.isPending;
  const variant = index === null ? undefined : variants[index];
  const category = props.options.categories.find((item) => item.id === props.values.category);
  const editedOption = value ? options[value.option] : undefined;
  const editedValue = value && editedOption ? editedOption.values[value.value] : undefined;
  const updateOption = (position: number, changes: Partial<ProductOption>) =>
    props.onChange({
      options: options.map((item, i) => (i === position ? { ...item, ...changes } : item)),
    });
  const updateVariant = (changes: Partial<ProductVariantWriteRequest>) =>
    props.onChange({
      variants: variants.map((item, i) => (i === index ? { ...item, ...changes } : item)),
    });
  const addValues = (position: number) => {
    const option = options[position]!;
    const added = (drafts[position] ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry && !option.values.some((existing) => existing.value === entry));
    if (added.length)
      updateOption(position, {
        values: [
          ...option.values,
          ...[...new Set(added)].map((entry, offset) => ({
            id: Crypto.randomUUID(),
            value: entry,
            position: option.values.length + offset,
          })),
        ].slice(0, 250),
      });
    setDrafts({ ...drafts, [position]: '' });
  };
  const changeValue = (changes: Partial<ProductOption['values'][number]>) => {
    if (!value || !editedOption) return;
    updateOption(value.option, {
      values: editedOption.values.map((entry, i) =>
        i === value.value ? { ...entry, ...changes } : entry
      ),
    });
  };
  async function generateVariants() {
    setError(null);
    try {
      const result = await generate.mutateAsync({ options, existing: variants });
      props.onChange({ variants: result.variants });
      setWarnings(result.warnings);
    } catch (failure) {
      setError(failure);
    }
  }
  const ready =
    options.length > 0 &&
    options.every(
      (option) =>
        option.name.trim() &&
        option.values.length &&
        option.values.every((entry) => entry.value.trim())
    );
  const shown = variants
    .map((item, i) => ({ item, i }))
    .filter(({ item }) =>
      [item.name, item.sku, item.barcode].some((field) =>
        field?.toLocaleLowerCase().includes(search.toLocaleLowerCase())
      )
    );
  const thumbnail = (item: ProductVariantWriteRequest) => {
    const media = props.values.media?.find((entry) => entry.id === item.mediaId);
    const url = media?.url ?? media?.thumbnailUrl ?? item.image;
    return url ? (
      <AppImage
        image={{ thumb: url, card: url, full: url, alt: item.name }}
        size="thumb"
        decorative
        className="size-11 rounded-md bg-surface-alt"
      />
    ) : undefined;
  };
  return (
    <>
      {error ? <Banner tone="danger" message={describe(error)} /> : null}
      {warnings.length ? (
        <Banner
          tone="warning"
          message={warnings
            .map((reason) => describe(new ApiError(400, 'VALIDATION_ERROR', '', { reason })))
            .join('\n')}
        />
      ) : null}
      {canOptions ? (
        <FormGroup first title={t('options')} hint={t('optionsHint')}>
          {category?.options?.length && !options.length ? (
            <View className="gap-3 rounded-lg bg-info-soft p-4">
              <Text variant="label">{t('suggestedOptions', { category: category.name })}</Text>
              <Text variant="meta">{category.options.map((option) => option.name).join(', ')}</Text>
              <Button
                label={t('useCategoryOptions')}
                variant="primary"
                size="sm"
                className="self-start"
                disabled={disabled}
                onPress={() => props.onChange({ options: category.options })}
              />
            </View>
          ) : null}
          {options.map((option, position) => (
            <View key={option.id ?? position} className="gap-4 rounded-lg border border-border p-4">
              <View className="flex-row items-end gap-1">
                <View className="flex-1">
                  <TextField
                    label={t('optionName', { index: position + 1 })}
                    placeholder={t('optionNamePlaceholder')}
                    value={option.name}
                    editable={!disabled}
                    maxLength={200}
                    onChangeText={(name) => updateOption(position, { name })}
                  />
                </View>
                {position > 0 ? (
                  <IconButton
                    icon="arrow-up"
                    variant="plain"
                    label={t('moveOptionUp', { index: position + 1 })}
                    disabled={disabled}
                    onPress={() => {
                      const next = [...options];
                      [next[position - 1], next[position]] = [next[position]!, next[position - 1]!];
                      props.onChange({
                        options: next.map((item, order) => ({ ...item, position: order })),
                      });
                    }}
                  />
                ) : null}
                <IconButton
                  icon="trash"
                  variant="plain"
                  label={t('removeOption', { index: position + 1 })}
                  disabled={disabled}
                  onPress={() =>
                    props.onChange({
                      options: options
                        .filter((_, i) => i !== position)
                        .map((item, order) => ({ ...item, position: order })),
                    })
                  }
                />
              </View>
              {option.values.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {option.values.map((entry, i) => (
                    <ValueChip
                      key={entry.id ?? i}
                      label={entry.value || t('unnamedValue')}
                      accessibilityLabel={t('editOptionValue', {
                        option: position + 1,
                        value: entry.value || t('unnamedValue'),
                      })}
                      swatch={
                        entry.colorCode && COLOR.test(entry.colorCode) ? entry.colorCode : undefined
                      }
                      icon="pencil"
                      disabled={disabled}
                      onPress={() => setValue({ option: position, value: i })}
                    />
                  ))}
                </View>
              ) : null}
              <TextField
                label={t('newOptionValue', { index: position + 1 })}
                hideLabel
                placeholder={t('optionValuePlaceholder')}
                value={drafts[position] ?? ''}
                maxLength={200}
                editable={!disabled && option.values.length < 250}
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={() => addValues(position)}
                onChangeText={(next) => setDrafts({ ...drafts, [position]: next })}
                end={
                  <Button
                    label={t('add')}
                    accessibilityLabel={t('addOptionValue', { index: position + 1 })}
                    variant="ghost"
                    size="sm"
                    disabled={disabled || !(drafts[position] ?? '').trim()}
                    onPress={() => addValues(position)}
                  />
                }
              />
              <EditorChoice
                label={t('optionVisual', { index: position + 1 })}
                value={option.visual ?? ''}
                choices={[
                  { value: '', label: t('visuals.automatic') },
                  ...VISUALS.map((visual) => ({ value: visual, label: t(`visuals.${visual}`) })),
                ]}
                disabled={disabled}
                onChange={(visual) => updateOption(position, { visual: visual || undefined })}
              />
            </View>
          ))}
          <Button
            label={t('addOption')}
            icon="plus"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={disabled || options.length >= 50}
            onPress={() =>
              props.onChange({
                options: [
                  ...options,
                  { id: Crypto.randomUUID(), name: '', position: options.length, values: [] },
                ],
              })
            }
          />
        </FormGroup>
      ) : null}
      {canVariants ? (
        <FormGroup
          first={!canOptions}
          title={
            variants.length ? t('variantsCount', { count: variants.length }) : t('variantsTitle')
          }
          hint={t('variantLimit', { count: props.options.limits.variants })}>
          {options.length ? (
            <Button
              label={t('generateVariants')}
              icon="refresh"
              variant="primary"
              size="sm"
              className="self-start"
              loading={generate.isPending}
              disabled={props.disabled || !ready}
              onPress={() => void generateVariants()}
            />
          ) : null}
          {variants.length > 8 ? (
            <SearchField label={t('searchVariants')} value={search} onChangeText={setSearch} />
          ) : null}
          {shown.length ? (
            <RowGroup
              divider={shown.some(({ item }) => thumbnail(item)) ? 'leading' : 'text'}
              className="rounded-lg border border-border">
              {shown.map(({ item, i }) => (
                <ListRow
                  key={item.id ?? i}
                  leading={thumbnail(item)}
                  title={item.name || t('unnamedVariant')}
                  meta={
                    [
                      item.sku,
                      props.isNew || !item.id
                        ? t('variantStockShort', { count: item.stock ?? 0 })
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  }
                  accessibilityLabel={t('editVariant', { name: item.name || t('unnamedVariant') })}
                  chevron
                  disabled={disabled}
                  onPress={() => setIndex(i)}
                />
              ))}
            </RowGroup>
          ) : variants.length ? (
            <Text variant="caption">{t('noMatchingVariants')}</Text>
          ) : null}
          <Button
            label={t('addVariant')}
            icon="plus"
            variant="secondary"
            size="sm"
            className="self-start"
            disabled={disabled || variants.length >= props.options.limits.variants}
            onPress={() => {
              props.onChange({
                variants: [
                  ...variants,
                  { name: '', price: props.values.price, optionValues: [], stock: 0 },
                ],
              });
              setIndex(variants.length);
            }}
          />
        </FormGroup>
      ) : null}
      <Sheet
        visible={Boolean(editedValue)}
        title={t('optionValueTitle')}
        onClose={() => setValue(null)}
        footer={<Button label={t('done')} variant="accent" onPress={() => setValue(null)} />}>
        {editedValue && editedOption && value ? (
          <View className="gap-5">
            <TextField
              label={t('optionValue', { option: value.option + 1, index: value.value + 1 })}
              value={editedValue.value}
              maxLength={200}
              editable={!disabled}
              onChangeText={(next) => changeValue({ value: next })}
            />
            {swatched(editedOption) || editedValue.colorCode ? (
              <TextField
                label={t('optionColor', { option: value.option + 1, index: value.value + 1 })}
                value={editedValue.colorCode ?? ''}
                hint={t('colorCodeHint')}
                placeholder={t('colorCodePlaceholder')}
                optional
                autoCapitalize="none"
                maxLength={7}
                editable={!disabled}
                error={
                  editedValue.colorCode && !COLOR.test(editedValue.colorCode)
                    ? t('colorCodeHint')
                    : undefined
                }
                end={
                  editedValue.colorCode && COLOR.test(editedValue.colorCode) ? (
                    <View
                      style={{ backgroundColor: editedValue.colorCode }}
                      className="me-3 size-6 rounded-full border border-border"
                    />
                  ) : undefined
                }
                onChangeText={(colorCode) => changeValue({ colorCode: colorCode || undefined })}
              />
            ) : null}
            <Button
              label={t('removeOptionValue', { option: value.option + 1, index: value.value + 1 })}
              icon="trash"
              variant="ghost"
              destructive
              disabled={disabled}
              onPress={() => {
                updateOption(value.option, {
                  values: editedOption.values
                    .filter((_, i) => i !== value.value)
                    .map((entry, position) => ({ ...entry, position })),
                });
                setValue(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
      <Sheet
        visible={Boolean(variant)}
        title={variant?.name || t('variantEditor')}
        onClose={() => setIndex(null)}
        onClosed={() => {
          const next = asked.current.remove;
          asked.current.remove = undefined;
          if (next !== undefined) setRemove(next);
        }}
        footer={
          <Button label={t('doneVariant')} variant="accent" onPress={() => setIndex(null)} />
        }>
        {variant ? (
          <View className="gap-5">
            <TextField
              label={t('variantName')}
              value={variant.name}
              required
              editable={!disabled}
              onChangeText={(name) => updateVariant({ name })}
            />
            {options.length ? (
              <View className="gap-4">
                {options.map((option, optionIndex) => (
                  <EditorChoice
                    key={option.id ?? optionIndex}
                    label={option.name || t('optionName', { index: optionIndex + 1 })}
                    value={
                      variant.optionValues.find(
                        (entry) =>
                          (entry.optionId && entry.optionId === option.id) ||
                          entry.optionName === option.name
                      )?.value ?? ''
                    }
                    choices={[
                      { value: '', label: t('choose') },
                      ...option.values.map((entry) => ({ value: entry.value, label: entry.value })),
                    ]}
                    disabled={disabled}
                    onChange={(chosenValue) => {
                      const chosen = option.values.find((entry) => entry.value === chosenValue);
                      updateVariant({
                        optionValues: [
                          ...variant.optionValues.filter(
                            (entry) =>
                              !(entry.optionId && entry.optionId === option.id) &&
                              entry.optionName !== option.name
                          ),
                          ...(chosen
                            ? [
                                {
                                  optionId: option.id,
                                  optionName: option.name,
                                  valueId: chosen.id,
                                  value: chosen.value,
                                  colorCode: chosen.colorCode,
                                },
                              ]
                            : []),
                        ],
                      });
                    }}
                  />
                ))}
              </View>
            ) : null}
            <FormGroup title={t('sections.pricing')}>
              <EditorNumber
                label={t('price')}
                value={variant.price}
                unit={props.options.currency}
                disabled={disabled}
                onChange={(next) => updateVariant({ price: next ?? 0 })}
              />
              <View className="gap-5">
                {(['comparePrice', 'cost'] as const).map((key) => (
                  <EditorNumber
                    key={key}
                    label={t(key)}
                    value={variant[key]}
                    optional
                    unit={props.options.currency}
                    disabled={disabled}
                    onChange={(next) => updateVariant({ [key]: next ?? null })}
                  />
                ))}
              </View>
            </FormGroup>
            <FormGroup title={t('sections.inventory')}>
              <View className="gap-5">
                {(['sku', 'barcode'] as const).map((key) => (
                  <TextField
                    key={key}
                    label={t(`variant${key === 'sku' ? 'Sku' : 'Barcode'}`)}
                    value={variant[key] ?? ''}
                    optional
                    editable={!disabled}
                    onChangeText={(next) => updateVariant({ [key]: next })}
                  />
                ))}
              </View>
              {variant.barcode ? (
                <BarcodeDetails
                  format={variant.barcodeFormat ?? ''}
                  source={variant.barcodeSource ?? ''}
                  disabled={disabled}
                  onChange={(changes) =>
                    updateVariant({
                      ...('barcodeFormat' in changes
                        ? { barcodeFormat: changes.barcodeFormat ?? undefined }
                        : {}),
                      ...('barcodeSource' in changes
                        ? { barcodeSource: changes.barcodeSource ?? undefined }
                        : {}),
                    })
                  }
                />
              ) : null}
              <EditorToggle
                label={t('tracked')}
                value={variant.inventory?.tracked ?? true}
                disabled={disabled}
                onChange={(tracked) =>
                  updateVariant({
                    inventory: {
                      tracked,
                      continueSellingWhenOutOfStock:
                        variant.inventory?.continueSellingWhenOutOfStock ?? false,
                    },
                  })
                }>
                <EditorToggle
                  label={t('continueSellingWhenOutOfStock')}
                  value={variant.inventory?.continueSellingWhenOutOfStock ?? false}
                  disabled={disabled}
                  onChange={(continueSellingWhenOutOfStock) =>
                    updateVariant({
                      inventory: {
                        tracked: variant.inventory?.tracked ?? true,
                        continueSellingWhenOutOfStock,
                      },
                    })
                  }
                />
              </EditorToggle>
              {props.isNew || !variant.id ? (
                <>
                  <EditorNumber
                    label={t('variantStock')}
                    value={variant.stock}
                    optional
                    integer
                    disabled={disabled}
                    onChange={(stock) => updateVariant({ stock })}
                  />
                  {props.options.locations.length > 1 ? (
                    <Disclosure
                      label={t('locationInventory')}
                      hint={props.options.locations.map((location) => location.name).join(', ')}
                      defaultOpen={Boolean(variant.locationInventory?.length)}>
                      {props.options.locations.map((location) => (
                        <EditorNumber
                          key={location.id}
                          label={t('locationStock', { location: location.name })}
                          value={
                            variant.locationInventory?.find((row) => row.locationId === location.id)
                              ?.quantity
                          }
                          optional
                          integer
                          disabled={disabled}
                          onChange={(quantity) =>
                            updateVariant({
                              locationInventory: [
                                ...(variant.locationInventory ?? []).filter(
                                  (row) => row.locationId !== location.id
                                ),
                                ...(quantity === undefined
                                  ? []
                                  : [{ locationId: location.id, quantity }]),
                              ],
                            })
                          }
                        />
                      ))}
                    </Disclosure>
                  ) : null}
                </>
              ) : (
                <Text variant="caption">{t('stockSeparate')}</Text>
              )}
            </FormGroup>
            <FormGroup title={t('sections.shipping')}>
              <EditorToggle
                label={t('requiresShipping')}
                value={
                  variant.requiresShipping ?? props.values.shipping?.isPhysicalProduct !== false
                }
                disabled={disabled}
                onChange={(requiresShipping) => updateVariant({ requiresShipping })}
              />
              <FieldRow>
                <EditorNumber
                  label={t('weight')}
                  value={variant.weight}
                  optional
                  marker={false}
                  disabled={disabled}
                  onChange={(weight) => updateVariant({ weight })}
                />
                <EditorChoice
                  label={t('weightUnit')}
                  value={variant.weightUnit ?? props.options.shipping.weightUnit}
                  choices={(['g', 'kg', 'lb', 'oz'] as const).map((unit) => ({
                    value: unit,
                    label: t(`units.${unit}`),
                  }))}
                  disabled={disabled}
                  onChange={(weightUnit) =>
                    updateVariant({
                      weightUnit: weightUnit as ProductVariantWriteRequest['weightUnit'],
                    })
                  }
                />
              </FieldRow>
            </FormGroup>
            <Disclosure
              label={t('moreVariantSettings')}
              hint={t('moreVariantSettingsHint')}
              defaultOpen={Boolean(
                variant.image || variant.attributes?.length || variant.preorder?.enabled
              )}>
              <EditorChoice
                label={t('variantMedia')}
                optional
                value={variant.mediaId ?? ''}
                choices={[
                  { value: '', label: t('none') },
                  ...(props.values.media ?? []).map((item, mediaIndex) => ({
                    value: item.id,
                    label: item.filename || item.alt || t('mediaItem', { index: mediaIndex + 1 }),
                  })),
                ]}
                disabled={disabled}
                onChange={(mediaId) => {
                  const item = props.values.media?.find((media) => media.id === mediaId);
                  updateVariant({
                    mediaId: mediaId || undefined,
                    image: item?.type === 'image' ? item.url : undefined,
                  });
                }}
              />
              <TextField
                label={t('variantImage')}
                value={variant.image ?? ''}
                optional
                editable={!disabled}
                keyboardType="url"
                autoCapitalize="none"
                onChangeText={(image) => updateVariant({ image })}
              />
              <EditorToggle
                label={t('finalSale')}
                value={variant.finalSale ?? false}
                disabled={disabled}
                onChange={(finalSale) => updateVariant({ finalSale })}
              />
              <AttributeFields
                value={variant.attributes ?? []}
                disabled={disabled}
                onChange={(attributes) => updateVariant({ attributes })}
              />
              {props.options.features.preorders && props.options.preorder.allowed ? (
                <PreorderFields
                  value={variant.preorder ?? { enabled: false }}
                  disabled={disabled}
                  deferred={props.options.preorder.deferredBalanceSupported}
                  onChange={(preorder) => updateVariant({ preorder })}
                />
              ) : null}
            </Disclosure>
            <Button
              label={t('removeVariant')}
              icon="trash"
              variant="ghost"
              destructive
              disabled={disabled}
              onPress={() => {
                asked.current.remove = index ?? undefined;
                setIndex(null);
              }}
            />
          </View>
        ) : null}
      </Sheet>
      <ConfirmSheet
        visible={remove !== null && Boolean(variants[remove])}
        title={t('removeVariantTitle')}
        body={t('removeVariantBody')}
        confirmLabel={t('removeVariant')}
        cancelLabel={t('keepVariant')}
        tone="danger"
        onCancel={() => {
          asked.current.reopen = remove ?? undefined;
          setRemove(null);
        }}
        onClosed={() => {
          const next = asked.current.reopen;
          asked.current.reopen = undefined;
          if (next !== undefined) setIndex(next);
        }}
        onConfirm={() => {
          props.onChange({ variants: variants.filter((_, i) => i !== remove) });
          setRemove(null);
        }}
      />
    </>
  );
}

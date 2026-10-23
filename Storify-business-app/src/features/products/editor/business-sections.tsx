import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { ProductEditorFields, ProductPreorderRequest } from '@/contracts/mobile/biz/v1';
import { useConfig } from '@/features/config/use-config';
import { useCan } from '@/features/workspace/use-workspace';

import { EditorChoice, EditorNumber, EditorToggle } from './controls';
import {
  ChoiceCards,
  ChoiceChips,
  Disclosure,
  FormGroup,
  FieldRow,
  ValueChip,
} from '@/components/ui/form-sections';
import { RichDescription } from './rich-description';
import { plainText } from './summaries';
import type { ProductEditorSectionProps } from './types';

const UNITS = ['item', 'g', 'kg', 'lb', 'oz', 'ml', 'l'] as const;
const WEIGHTS = ['g', 'kg', 'lb', 'oz'] as const;
export const BARCODE_FORMATS = ['ean13', 'upca', 'gtin14', 'code128'] as const;
export const BARCODE_SOURCES = ['manufacturer', 'gs1', 'internal'] as const;

type Field = keyof ProductEditorFields;

function useFields(props: ProductEditorSectionProps) {
  const t = useTranslations('products.editor');
  const has = (key: Field) => props.writableFields.includes(key);
  const issue = (key: Field) =>
    props.issues.has(key)
      ? t.has(`issues.${key}` as never)
        ? t(`issues.${key}` as never)
        : t('issues.field')
      : undefined;
  const text = (
    key: 'name' | 'title' | 'shortDescription' | 'productType' | 'sku' | 'barcode',
    maxLength: number,
    extra: { optional?: boolean; hint?: string; placeholder?: string; multiline?: boolean } = {}
  ) => {
    const optional = extra.optional ?? true;
    // The store keeps a display title once saved: it can be changed, not removed. Emptied,
    // the field says so, and the draft holds the empty title for the check to refuse.
    const keptTitle = key === 'title' && Boolean(props.saved?.title);
    return has(key) ? (
      <TextField
        key={key}
        label={t(key)}
        optional={optional}
        required={!optional}
        hint={extra.hint}
        placeholder={extra.placeholder}
        multiline={extra.multiline}
        inputClassName={extra.multiline ? 'min-h-20' : undefined}
        error={issue(key) ?? (keptTitle && !props.values.title ? t('issues.title') : undefined)}
        value={String(props.values[key] ?? '')}
        maxLength={maxLength}
        editable={!props.disabled}
        onChangeText={(value) =>
          props.onChange({ [key]: value || (key === 'title' && !keptTitle ? undefined : '') })
        }
      />
    ) : null;
  };
  const number = (
    key: 'price' | 'comparePrice' | 'cost' | 'stock',
    extra: { hint?: string; unit?: string } = {}
  ) =>
    has(key) ? (
      <EditorNumber
        key={key}
        label={t(key)}
        value={props.values[key]}
        optional={key !== 'price'}
        integer={key === 'stock'}
        unit={extra.unit}
        hint={issue(key) ?? extra.hint}
        disabled={props.disabled}
        onChange={(value) =>
          props.onChange({
            [key]: value ?? (key === 'comparePrice' || key === 'cost' ? null : undefined),
          })
        }
      />
    ) : null;
  return { t, has, issue, text, number };
}

export function DetailsSection(props: ProductEditorSectionProps) {
  const { t, has, issue, text } = useFields(props);
  const { values: v, options: o, onChange, disabled } = props;
  const moreFilled = Boolean(v.title || v.productType || v.attributes?.length);
  const more = [
    has('title') && t('title'),
    has('productType') && t('productType'),
    has('attributes') && t('attributes'),
  ].filter(Boolean);
  return (
    <>
      {text('name', 200, { optional: false, placeholder: t('namePlaceholder') })}
      {has('description') ? (
        <RichDescription
          value={v.description}
          onChange={(description) => onChange({ description })}
          disabled={disabled}
          error={issue('description')}
        />
      ) : null}
      {text('shortDescription', 500, { hint: t('shortDescriptionHint'), multiline: true })}
      <FormGroup title={t('organization')}>
        {has('category') ? (
          <EditorChoice
            label={t('category')}
            required
            value={v.category}
            error={issue('category')}
            choices={o.categories.map((item) => ({
              value: item.id,
              label: item.name,
              description: item.path.length > 1 ? item.path.join(' / ') : undefined,
            }))}
            onChange={(categoryId) => onChange({ category: categoryId })}
            disabled={disabled}
          />
        ) : null}
        {has('brand') ? (
          <EditorChoice
            label={t('brand')}
            optional
            value={v.brand ?? ''}
            choices={[
              { value: '', label: t('none') },
              ...o.brands.map((item) => ({ value: item.id, label: item.name })),
            ]}
            onChange={(brand) => onChange({ brand: brand || null })}
            disabled={disabled}
          />
        ) : null}
        {has('collectionIds') && o.collections.length ? (
          <View className="gap-2">
            <Text variant="label">{t('collectionIds')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {o.collections.map((item) => {
                const selected = Boolean(v.collectionIds?.includes(item.id));
                return (
                  <ValueChip
                    key={item.id}
                    label={item.title}
                    accessibilityLabel={item.title}
                    icon={selected ? 'check' : 'plus'}
                    selected={selected}
                    disabled={disabled}
                    onPress={() =>
                      onChange({
                        collectionIds: selected
                          ? (v.collectionIds ?? []).filter((id) => id !== item.id)
                          : [...(v.collectionIds ?? []), item.id],
                      })
                    }
                  />
                );
              })}
            </View>
          </View>
        ) : null}
        {has('tags') ? (
          <TagField
            values={v.tags ?? []}
            disabled={disabled}
            onChange={(tags) => onChange({ tags })}
          />
        ) : null}
      </FormGroup>
      {more.length ? (
        <Disclosure label={t('moreDetails')} hint={more.join(', ')} defaultOpen={moreFilled}>
          {text('title', 200, { hint: t('titleHint') })}
          {text('productType', 200, { placeholder: t('productTypePlaceholder') })}
          {has('attributes') ? (
            <AttributeFields
              value={v.attributes ?? []}
              disabled={disabled}
              onChange={(attributes) => onChange({ attributes })}
            />
          ) : null}
        </Disclosure>
      ) : null}
    </>
  );
}

/** Tags as pills, added from a field: Enter or the Add button, several at once with commas. */
function TagField({
  values,
  onChange,
  disabled,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  disabled: boolean;
}) {
  const t = useTranslations('products.editor');
  const [draft, setDraft] = useState('');
  const add = () => {
    const added = draft
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag && !values.includes(tag));
    if (added.length) onChange([...values, ...new Set(added)].slice(0, 500));
    setDraft('');
  };
  return (
    <View className="gap-3">
      <TextField
        label={t('tags')}
        optional
        hint={t('tagsHint')}
        placeholder={t('tagPlaceholder')}
        value={draft}
        maxLength={200}
        editable={!disabled}
        returnKeyType="done"
        submitBehavior="submit"
        onSubmitEditing={add}
        onChangeText={setDraft}
        end={
          <Button
            label={t('add')}
            accessibilityLabel={t('addTag')}
            variant="ghost"
            size="sm"
            disabled={disabled || !draft.trim()}
            onPress={add}
          />
        }
      />
      {values.length ? (
        <View className="flex-row flex-wrap gap-2">
          {values.map((tag) => (
            <ValueChip
              key={tag}
              label={tag}
              accessibilityLabel={t('removeTag', { tag })}
              disabled={disabled}
              onPress={() => onChange(values.filter((item) => item !== tag))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function AttributeFields({
  value,
  onChange,
  disabled,
}: {
  value: NonNullable<ProductEditorFields['attributes']>;
  onChange: (value: NonNullable<ProductEditorFields['attributes']>) => void;
  disabled: boolean;
}) {
  const t = useTranslations('products.editor');
  const change = (index: number, field: 'name' | 'value', next: string) =>
    onChange(
      value.map((attribute, position) =>
        position === index ? { ...attribute, [field]: next } : attribute
      )
    );
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text variant="label">{t('attributes')}</Text>
        <Text variant="caption">{t('attributesHint')}</Text>
      </View>
      {value.map((item, index) => (
        <View key={index} className="flex-row items-end gap-2">
          <View className="flex-1">
            <TextField
              label={t('attributeName', { index: index + 1 })}
              hideLabel={index > 0}
              placeholder={t('attributeNamePlaceholder')}
              value={item.name}
              maxLength={200}
              editable={!disabled}
              onChangeText={(next) => change(index, 'name', next)}
            />
          </View>
          <View className="flex-1">
            <TextField
              label={t('attributeValue', { index: index + 1 })}
              hideLabel={index > 0}
              placeholder={t('attributeValuePlaceholder')}
              value={item.value}
              maxLength={1000}
              editable={!disabled}
              onChangeText={(next) => change(index, 'value', next)}
            />
          </View>
          <IconButton
            label={t('removeAttribute', { index: index + 1 })}
            icon="trash"
            variant="plain"
            className="mb-0.5"
            disabled={disabled}
            onPress={() => onChange(value.filter((_, position) => position !== index))}
          />
        </View>
      ))}
      <Button
        label={t('addAttribute')}
        icon="plus"
        variant="secondary"
        size="sm"
        className="self-start"
        disabled={disabled || value.length >= 100}
        onPress={() => onChange([...value, { name: '', value: '' }])}
      />
    </View>
  );
}

export function PricingSection(props: ProductEditorSectionProps) {
  const { t, has, number } = useFields(props);
  const { values: v, onChange, disabled, options } = props;
  const currency = options.currency;
  const unit = v.unitPrice;
  const units = UNITS.map((value) => ({ value, label: t(`units.${value}`) }));
  const hasVariants = Boolean(v.variants?.length);
  return (
    <>
      {v.priceOnRequest ? null : (
        <>
          {number('price', {
            unit: currency,
            hint: hasVariants ? t('variantPricesHint') : undefined,
          })}
          {number('comparePrice', { unit: currency, hint: t('comparePriceHint') })}
          {number('cost', { unit: currency, hint: t('costHint') })}
        </>
      )}
      {has('chargeTax') ? (
        <EditorToggle
          label={t('chargeTax')}
          value={v.chargeTax ?? false}
          onChange={(chargeTax) => onChange({ chargeTax })}
          disabled={disabled}
        />
      ) : null}
      {has('priceOnRequest') && options.features.priceOnRequest ? (
        <EditorToggle
          label={t('priceOnRequest')}
          description={t('priceOnRequestHint')}
          value={v.priceOnRequest ?? false}
          onChange={(priceOnRequest) => onChange({ priceOnRequest })}
          disabled={disabled}>
          {has('quoteButtonLabel') ? (
            <TextField
              label={t('quoteButtonLabel')}
              optional
              placeholder={t('quoteButtonPlaceholder')}
              value={v.quoteButtonLabel ?? ''}
              maxLength={60}
              editable={!disabled}
              onChangeText={(quoteButtonLabel) =>
                onChange({ quoteButtonLabel: quoteButtonLabel || null })
              }
            />
          ) : null}
        </EditorToggle>
      ) : null}
      {has('unitPrice') ? (
        <FormGroup>
          <EditorToggle
            label={t('unitPrice')}
            description={t('unitPriceHint')}
            value={Boolean(unit)}
            disabled={disabled}
            onChange={(enabled) =>
              onChange({
                unitPrice: enabled
                  ? { totalAmount: 1, totalUnit: 'item', baseAmount: 1, baseUnit: 'item' }
                  : null,
              })
            }>
            {unit ? (
              <>
                <FieldRow>
                  <EditorNumber
                    label={t('totalAmount')}
                    value={unit.totalAmount}
                    disabled={disabled}
                    onChange={(totalAmount) =>
                      onChange({ unitPrice: { ...unit, totalAmount: totalAmount ?? 0 } })
                    }
                  />
                  <EditorChoice
                    label={t('totalUnit')}
                    value={unit.totalUnit}
                    choices={units}
                    disabled={disabled}
                    onChange={(totalUnit) =>
                      onChange({
                        unitPrice: { ...unit, totalUnit: totalUnit as typeof unit.totalUnit },
                      })
                    }
                  />
                </FieldRow>
                <FieldRow>
                  <EditorNumber
                    label={t('baseAmount')}
                    value={unit.baseAmount}
                    disabled={disabled}
                    onChange={(baseAmount) =>
                      onChange({ unitPrice: { ...unit, baseAmount: baseAmount ?? 0 } })
                    }
                  />
                  <EditorChoice
                    label={t('baseUnit')}
                    value={unit.baseUnit}
                    choices={units}
                    disabled={disabled}
                    onChange={(baseUnit) =>
                      onChange({
                        unitPrice: { ...unit, baseUnit: baseUnit as typeof unit.baseUnit },
                      })
                    }
                  />
                </FieldRow>
              </>
            ) : null}
          </EditorToggle>
          {has('unitPriceUnit') ? (
            <EditorChoice
              label={t('unitPriceUnit')}
              optional
              value={v.unitPriceUnit ?? ''}
              choices={[{ value: '', label: t('none') }, ...units]}
              disabled={disabled}
              onChange={(value) =>
                onChange({
                  unitPriceUnit: value
                    ? (value as NonNullable<ProductEditorFields['unitPriceUnit']>)
                    : null,
                })
              }
            />
          ) : null}
        </FormGroup>
      ) : null}
    </>
  );
}

/** A barcode's standard and who issued it, shown once there is a barcode. */
function BarcodeDetails({
  format,
  source,
  onChange,
  disabled,
}: {
  format: string;
  source: string;
  onChange: (changes: {
    barcodeFormat?: (typeof BARCODE_FORMATS)[number] | null;
    barcodeSource?: (typeof BARCODE_SOURCES)[number] | null;
  }) => void;
  disabled: boolean;
}) {
  const t = useTranslations('products.editor');
  return (
    <FieldRow>
      <EditorChoice
        label={t('barcodeFormat')}
        value={format}
        choices={[
          { value: '', label: t('none') },
          ...BARCODE_FORMATS.map((value) => ({ value, label: t(`barcodeFormats.${value}`) })),
        ]}
        onChange={(value) =>
          onChange({ barcodeFormat: (value || null) as (typeof BARCODE_FORMATS)[number] | null })
        }
        disabled={disabled}
      />
      <EditorChoice
        label={t('barcodeSource')}
        value={source}
        choices={[
          { value: '', label: t('none') },
          ...BARCODE_SOURCES.map((value) => ({ value, label: t(`barcodeSources.${value}`) })),
        ]}
        onChange={(value) =>
          onChange({ barcodeSource: (value || null) as (typeof BARCODE_SOURCES)[number] | null })
        }
        disabled={disabled}
      />
    </FieldRow>
  );
}

export { BarcodeDetails };

export function InventorySection(props: ProductEditorSectionProps) {
  const { t, has, text, number } = useFields(props);
  const { values: v, onChange, disabled, isNew, productId, options } = props;
  const seeStock = useCan('VIEW_STOCK');
  const inventory = v.inventory ?? { tracked: true, continueSellingWhenOutOfStock: false };
  const hasVariants = Boolean(v.variants?.length);
  const locations = has('locationInventory') ? options.locations : [];
  return (
    <>
      {has('sku') || has('barcode') ? (
        <FormGroup first title={t('identifiers')}>
          {text('sku', 100, { placeholder: t('skuPlaceholder') })}
          {text('barcode', 64)}
          {v.barcode && (has('barcodeFormat') || has('barcodeSource')) ? (
            <BarcodeDetails
              format={v.barcodeFormat ?? ''}
              source={v.barcodeSource ?? ''}
              disabled={disabled}
              onChange={(changes) => onChange(changes)}
            />
          ) : null}
        </FormGroup>
      ) : null}
      <FormGroup first={!has('sku') && !has('barcode')} title={t('quantity')}>
        {has('inventory') ? (
          <EditorToggle
            label={t('tracked')}
            description={t('trackedHint')}
            value={inventory.tracked}
            disabled={disabled}
            onChange={(tracked) => onChange({ inventory: { ...inventory, tracked } })}>
            <EditorToggle
              label={t('continueSellingWhenOutOfStock')}
              description={t('continueSellingHint')}
              value={inventory.continueSellingWhenOutOfStock}
              disabled={disabled}
              onChange={(continueSellingWhenOutOfStock) =>
                onChange({ inventory: { ...inventory, continueSellingWhenOutOfStock } })
              }
            />
          </EditorToggle>
        ) : null}
        {hasVariants ? (
          <Text variant="caption">{t('variantStockHint')}</Text>
        ) : isNew ? (
          <>
            {number('stock', { hint: t('initialStockHint') })}
            {locations.length > 1 ? (
              <Disclosure
                label={t('locationInventory')}
                hint={locations.map((location) => location.name).join(', ')}
                defaultOpen={Boolean(v.locationInventory?.length)}>
                {locations.map((location) => (
                  <EditorNumber
                    key={location.id}
                    label={t('locationStock', { location: location.name })}
                    value={
                      v.locationInventory?.find((row) => row.locationId === location.id)?.quantity
                    }
                    optional
                    integer
                    disabled={disabled}
                    onChange={(quantity) =>
                      onChange({
                        locationInventory: [
                          ...(v.locationInventory ?? []).filter(
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
          <View className="gap-3">
            <Text variant="caption">{t('stockSeparate')}</Text>
            {seeStock && productId ? (
              <Button
                label={t('openStock')}
                icon="boxes"
                variant="secondary"
                size="sm"
                className="self-start"
                disabled={disabled}
                onPress={() =>
                  router.push({ pathname: '/products/[id]/stock', params: { id: productId } })
                }
              />
            ) : null}
          </View>
        )}
      </FormGroup>
    </>
  );
}

export function ShippingSection(props: ProductEditorSectionProps) {
  const { t, has } = useFields(props);
  const { values: v, onChange, disabled, isNew, options } = props;
  const shipping = v.shipping ?? { isPhysicalProduct: true };
  const change = (fields: Partial<NonNullable<ProductEditorFields['shipping']>>) =>
    onChange({ shipping: { ...shipping, ...fields } });
  if (!has('shipping')) return null;
  const customsFilled = Boolean(
    shipping.countryOfOrigin || shipping.hsCode || shipping.customsDescription
  );
  return (
    <>
      <ChoiceCards
        label={t('format')}
        value={shipping.isPhysicalProduct ? 'physical' : 'digital'}
        choices={options.formats.map((value) => ({
          value,
          label: t(`formats.${value}`),
          description: t(`formatHints.${value}`),
        }))}
        disabled={disabled || !isNew}
        onChange={(format) => change({ isPhysicalProduct: format === 'physical' })}
      />
      {!isNew ? <Text variant="caption">{t('formatImmutable')}</Text> : null}
      {shipping.isPhysicalProduct && options.shipping.enabled ? (
        <FormGroup
          title={t('package')}
          hint={options.shipping.usesWeightRates ? t('weightRequiredHint') : undefined}>
          <FieldRow>
            <EditorNumber
              label={t('weight')}
              value={shipping.weight}
              optional
              marker={false}
              unit={t(`units.${shipping.weightUnit ?? options.shipping.weightUnit}`)}
              disabled={disabled}
              onChange={(weight) => change({ weight })}
            />
            <EditorChoice
              label={t('weightUnit')}
              value={shipping.weightUnit ?? options.shipping.weightUnit}
              choices={WEIGHTS.map((value) => ({ value, label: t(`units.${value}`) }))}
              disabled={disabled}
              onChange={(weightUnit) =>
                change({ weightUnit: weightUnit as typeof shipping.weightUnit })
              }
            />
          </FieldRow>
          <FieldRow>
            {(['length', 'width', 'height'] as const).map((key) => (
              <EditorNumber
                key={key}
                label={t(key)}
                value={shipping[key]}
                optional
                marker={false}
                disabled={disabled}
                onChange={(value) => change({ [key]: value })}
              />
            ))}
          </FieldRow>
          <ChoiceChips
            label={t('dimensionUnit')}
            value={shipping.dimensionUnit ?? 'cm'}
            choices={(['cm', 'in'] as const).map((value) => ({
              value,
              label: t(`units.${value}`),
            }))}
            disabled={disabled}
            onChange={(dimensionUnit) => change({ dimensionUnit })}
          />
        </FormGroup>
      ) : null}
      {shipping.isPhysicalProduct && options.shipping.customsEnabled ? (
        <Disclosure label={t('customs')} hint={t('customsHint')} defaultOpen={customsFilled}>
          <TextField
            label={t('countryOfOrigin')}
            optional
            placeholder={t('countryPlaceholder')}
            value={shipping.countryOfOrigin ?? ''}
            maxLength={2}
            autoCapitalize="characters"
            editable={!disabled}
            onChangeText={(countryOfOrigin) => change({ countryOfOrigin })}
          />
          <TextField
            label={t('hsCode')}
            optional
            value={shipping.hsCode ?? ''}
            maxLength={100}
            editable={!disabled}
            onChangeText={(hsCode) => change({ hsCode })}
          />
          <TextField
            label={t('customsDescription')}
            optional
            value={shipping.customsDescription ?? ''}
            maxLength={500}
            editable={!disabled}
            onChangeText={(customsDescription) => change({ customsDescription })}
          />
        </Disclosure>
      ) : null}
    </>
  );
}

export function AvailabilitySection(props: ProductEditorSectionProps) {
  const { t, has } = useFields(props);
  const { values: v, onChange, disabled } = props;
  const publishing = v.publishing ?? { onlineStore: false, pointOfSale: false };
  const returns = v.returns ?? { finalSale: false };
  const statuses = props.options.actions
    .filter((action) => action !== 'delete')
    .map((action) => action.slice(4) as NonNullable<ProductEditorFields['status']>);
  return (
    <>
      {has('status') ? (
        <ChoiceCards
          label={t('status')}
          value={v.status ?? ''}
          choices={[
            ...(props.isNew
              ? [{ value: '', label: t('storeDefault'), description: t('statusHints.default') }]
              : []),
            ...statuses.map((status) => ({
              value: status,
              label: t(`statuses.${status}`),
              description: t(`statusHints.${status}`),
            })),
          ]}
          disabled={disabled}
          onChange={(status) =>
            onChange({ status: status ? (status as ProductEditorFields['status']) : undefined })
          }
        />
      ) : null}
      {has('publishing') || has('featured') ? (
        <FormGroup title={t('publishing')}>
          <View>
            {has('publishing') ? (
              <>
                <EditorToggle
                  label={t('onlineStore')}
                  value={publishing.onlineStore}
                  disabled={disabled}
                  onChange={(onlineStore) =>
                    onChange({ publishing: { ...publishing, onlineStore } })
                  }
                />
                <EditorToggle
                  label={t('pointOfSale')}
                  value={publishing.pointOfSale}
                  disabled={disabled}
                  onChange={(pointOfSale) =>
                    onChange({ publishing: { ...publishing, pointOfSale } })
                  }
                />
              </>
            ) : null}
            {has('featured') ? (
              <EditorToggle
                label={t('featured')}
                description={t('featuredHint')}
                value={v.featured ?? false}
                disabled={disabled}
                onChange={(featured) => onChange({ featured })}
              />
            ) : null}
          </View>
        </FormGroup>
      ) : null}
      {has('returns') ? (
        <FormGroup title={t('returns')}>
          <EditorToggle
            label={t('finalSale')}
            description={t('finalSaleHint')}
            value={returns.finalSale}
            disabled={disabled}
            onChange={(finalSale) => onChange({ returns: { ...returns, finalSale } })}
          />
          {returns.finalSale ? null : (
            <EditorNumber
              label={t('windowDays')}
              value={returns.windowDays}
              integer
              optional
              unit={t('days')}
              hint={t('windowDaysHint')}
              disabled={disabled}
              onChange={(windowDays) =>
                onChange({ returns: { ...returns, windowDays: windowDays ?? null } })
              }
            />
          )}
        </FormGroup>
      ) : null}
    </>
  );
}

export function PreorderFields({
  value,
  onChange,
  disabled,
  deferred = true,
}: {
  value: ProductPreorderRequest;
  onChange: (value: ProductPreorderRequest) => void;
  disabled: boolean;
  deferred?: boolean;
}) {
  const t = useTranslations('products.editor');
  const change = (fields: Partial<ProductPreorderRequest>) => onChange({ ...value, ...fields });
  const date = (key: 'releaseDate' | 'supplierEta') => (
    <TextField
      label={t(key)}
      optional
      value={value[key] ?? ''}
      placeholder={t('datePlaceholder')}
      autoCapitalize="none"
      editable={!disabled}
      onChangeText={(next) => change({ [key]: next })}
    />
  );
  return (
    <EditorToggle
      label={t('preorderEnabled')}
      description={t('preorderHint')}
      value={value.enabled}
      disabled={disabled}
      onChange={(enabled) => change({ enabled })}>
      <>
        {date('releaseDate')}
        {date('supplierEta')}
        <TextField
          label={t('message')}
          optional
          value={value.message ?? ''}
          placeholder={t('preorderMessagePlaceholder')}
          maxLength={500}
          editable={!disabled}
          onChangeText={(message) => change({ message })}
        />
        <EditorNumber
          label={t('preorderLimit')}
          value={value.limit}
          optional
          integer
          disabled={disabled}
          onChange={(limit) => change({ limit })}
        />
        <TextField
          label={t('batchName')}
          optional
          value={value.batchName ?? ''}
          maxLength={120}
          editable={!disabled}
          onChangeText={(batchName) => change({ batchName })}
        />
        <View>
          {(['preorderOnly', 'autoConvert'] as const).map((key) => (
            <EditorToggle
              key={key}
              label={t(key)}
              value={value[key] ?? false}
              disabled={disabled}
              onChange={(next) => change({ [key]: next })}
            />
          ))}
        </View>
        <ChoiceChips
          label={t('paymentMode')}
          value={value.paymentMode ?? 'full'}
          choices={(deferred
            ? (['full', 'deposit', 'pay_later'] as const)
            : (['full'] as const)
          ).map((mode) => ({ value: mode, label: t(`payments.${mode}`) }))}
          disabled={disabled}
          onChange={(paymentMode) => change({ paymentMode })}
        />
        {value.paymentMode === 'deposit' ? (
          <FieldRow>
            <EditorChoice
              label={t('depositType')}
              value={value.depositType ?? 'percentage'}
              choices={(['percentage', 'fixed'] as const).map((type) => ({
                value: type,
                label: t(`deposits.${type}`),
              }))}
              disabled={disabled}
              onChange={(depositType) =>
                change({ depositType: depositType as ProductPreorderRequest['depositType'] })
              }
            />
            <EditorNumber
              label={t('depositValue')}
              value={value.depositValue}
              unit={value.depositType === 'fixed' ? undefined : t('percent')}
              disabled={disabled}
              onChange={(depositValue) => change({ depositValue })}
            />
          </FieldRow>
        ) : null}
      </>
    </EditorToggle>
  );
}

export function PreorderSection(props: ProductEditorSectionProps) {
  const { t, has } = useFields(props);
  if (!has('preorder') || !props.options.features.preorders) return null;
  const policy = props.options.preorder;
  return (
    <>
      {!policy.allowed ? (
        <Banner
          tone="warning"
          message={[t('preorderUnavailable'), policy.blockedBy].filter(Boolean).join(' ')}
        />
      ) : null}
      <PreorderFields
        value={props.values.preorder ?? { enabled: false }}
        onChange={(preorder) => props.onChange({ preorder })}
        disabled={props.disabled || !policy.allowed}
        deferred={policy.deferredBalanceSupported}
      />
      <Text variant="caption">
        {t('preorderLimits', { days: policy.maxLeadDays, percent: policy.maxDepositPercent })}
      </Text>
    </>
  );
}

/** How the product may look in a search engine, then the fields that change it. */
export function SeoSection(props: ProductEditorSectionProps) {
  const { t, has } = useFields(props);
  const config = useConfig();
  if (!has('seo')) return null;
  const seo = props.values.seo ?? {};
  const v = props.values;
  const title = seo.pageTitle || v.title || v.name;
  const description = seo.metaDescription || v.shortDescription || plainText(v.description ?? '');
  const site = (config.data?.store.websiteUrl ?? '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const handle = seo.handle || slug(v.name);
  const field = (key: 'pageTitle' | 'metaDescription' | 'handle', max: number) => (
    <TextField
      key={key}
      label={t(key)}
      value={seo[key] ?? ''}
      optional
      multiline={key === 'metaDescription'}
      inputClassName={key === 'metaDescription' ? 'min-h-20' : undefined}
      autoCapitalize={key === 'handle' ? 'none' : undefined}
      hint={
        key === 'handle'
          ? t('handleHint')
          : t('characterCount', { count: (seo[key] ?? '').length, max })
      }
      editable={!props.disabled}
      maxLength={key === 'metaDescription' ? 1000 : 200}
      onChangeText={(value) => props.onChange({ seo: { ...seo, [key]: value } })}
    />
  );
  return (
    <>
      {title ? (
        <View
          accessible
          accessibilityLabel={t('searchPreview')}
          className="gap-1 rounded-lg border border-border p-4">
          {config.data ? (
            <Text variant="caption" numberOfLines={1}>
              {t('searchPreviewUrl', { store: config.data.store.name, site, handle })}
            </Text>
          ) : null}
          <Text variant="subheading" numberOfLines={1} className="text-link">
            {title}
          </Text>
          {description ? (
            <Text variant="meta" numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text variant="caption">{t('searchPreviewEmpty')}</Text>
      )}
      <Disclosure
        label={t('editSearchListing')}
        hint={t('editSearchListingHint')}
        defaultOpen={Boolean(seo.pageTitle || seo.metaDescription || seo.handle)}>
        {field('pageTitle', 70)}
        {field('metaDescription', 160)}
        {field('handle', 200)}
      </Disclosure>
    </>
  );
}

function slug(name: string) {
  return name
    .toLocaleLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

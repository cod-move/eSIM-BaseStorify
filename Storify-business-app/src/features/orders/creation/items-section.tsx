import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { ApiError } from '@/api/errors';
import { AppImage } from '@/components/ui/app-image';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { QuantityStepper } from '@/components/ui/quantity-stepper';
import { ListRow, RowGroup } from '@/components/ui/rows';
import { SearchField } from '@/components/ui/search-field';
import { SelectField } from '@/components/ui/select-field';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { ManualOrderFormOptions, OrderProductSelector } from '@/contracts/mobile/biz/v1';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { useOrderCreationProducts } from '../use-order-creation';
import { useCreationErrorMessage } from './controls';
import type { CreationDraft } from './draft';

type SectionProps = {
  draft: CreationDraft;
  options: ManualOrderFormOptions;
  onChange: (changes: Partial<CreationDraft>) => void;
  disabled: boolean;
};

/**
 * The order's lines: each with its picture, the store's price, a quantity
 * stepper and a remove button. Products are added from a sheet that searches,
 * scans and picks variants.
 */
export function CreationItems({ draft, options, onChange, disabled }: SectionProps) {
  const t = useTranslations('orders.create');
  const [adding, setAdding] = useState<'search' | 'scan' | null>(null);
  const items = draft.form.items;
  const setItems = (next: typeof items) => onChange({ form: { ...draft.form, items: next } });
  return (
    <>
      {options.locations.length > 1 ? (
        <SelectField
          label={t('location')}
          hint={t('locationHint')}
          value={draft.form.locationId ?? ''}
          choices={[
            { value: '', label: t('automaticLocation') },
            ...options.locations.map((item) => ({ value: item.id, label: item.name })),
          ]}
          disabled={disabled}
          onChange={(locationId) =>
            onChange({ form: { ...draft.form, locationId: locationId || undefined } })
          }
        />
      ) : null}
      {items.length ? (
        <View className="overflow-hidden rounded-lg border border-border">
          {items.map((item, index) => {
            const product = draft.products.find((row) => row.id === item.productId);
            const variant = product?.variants.find((row) => row.id === item.variantId);
            const price = variant?.price ?? product?.price;
            return (
              <View
                key={`${item.productId}:${item.variantId ?? ''}`}
                className={cn('gap-3 p-3', index > 0 && 'border-t border-border')}>
                <View className="flex-row items-start gap-3">
                  <AppImage
                    image={variant?.image ?? product?.image}
                    size="thumb"
                    decorative
                    className="size-14 rounded-md bg-surface-alt"
                  />
                  <View className="flex-1 gap-0.5">
                    <Text variant="label" numberOfLines={2}>
                      {product?.name ?? item.productId}
                    </Text>
                    {variant ? (
                      <Text variant="meta" numberOfLines={1}>
                        {variant.name}
                      </Text>
                    ) : null}
                    {price ? (
                      <Text variant="meta">{t('eachPrice', { price: price.formatted })}</Text>
                    ) : null}
                  </View>
                  <IconButton
                    icon="trash"
                    variant="plain"
                    label={t('removeItem', { index: index + 1 })}
                    className="-me-2 -mt-2"
                    disabled={disabled}
                    onPress={() => setItems(items.filter((_row, i) => i !== index))}
                  />
                </View>
                <View className="flex-row items-center justify-between gap-3">
                  <Text variant="meta">{t('quantityLabel')}</Text>
                  <QuantityStepper
                    label={t('quantity', { index: index + 1 })}
                    decreaseLabel={t('decrease', { index: index + 1 })}
                    increaseLabel={t('increase', { index: index + 1 })}
                    value={item.quantity}
                    max={options.limits.quantity}
                    disabled={disabled}
                    onChange={(quantity) =>
                      setItems(items.map((row, i) => (i === index ? { ...row, quantity } : row)))
                    }
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View className="items-center gap-1 rounded-lg border-[1.5px] border-dashed border-border px-4 py-6">
          <Icon name="package" colorClassName="accent-muted" />
          <Text variant="label" className="text-center">
            {t('noItems')}
          </Text>
          <Text variant="caption" className="text-center">
            {t('noItemsHint')}
          </Text>
        </View>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t('addProducts')}
          icon="plus"
          variant="primary"
          size="sm"
          disabled={disabled || items.length >= options.limits.lines}
          onPress={() => setAdding('search')}
        />
        <Button
          label={t('scan')}
          icon="scan-barcode"
          variant="secondary"
          size="sm"
          disabled={disabled || items.length >= options.limits.lines}
          onPress={() => setAdding('scan')}
        />
      </View>
      <Text variant="caption">
        {t('itemLimits', { lines: options.limits.lines, quantity: options.limits.quantity })}
      </Text>
      <ProductPicker
        mode={adding}
        onMode={setAdding}
        draft={draft}
        options={options}
        onChange={onChange}
        disabled={disabled}
      />
    </>
  );
}

/**
 * One sheet for finding products: search, a barcode read by the camera or
 * typed, and a product's variants. It stays open to add several; the count of
 * each already in the order shows on its row.
 */
function ProductPicker({
  mode,
  onMode,
  draft,
  options,
  onChange,
  disabled,
}: SectionProps & {
  mode: 'search' | 'scan' | null;
  onMode: (mode: 'search' | 'scan' | null) => void;
}) {
  const t = useTranslations('orders.create');
  const describe = useCreationErrorMessage();
  const refusal = (reason: string) => describe(new ApiError(409, 'CONFLICT', '', { reason }));
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [product, setProduct] = useState<OrderProductSelector | null>(null);
  const term = useDebouncedValue(search.trim().slice(0, 100));
  const products = useOrderCreationProducts(
    { search: term || undefined, barcode: barcode || undefined, locationId: draft.form.locationId },
    mode === 'search'
  );
  const items = draft.form.items;
  const units = items.reduce((total, item) => total + (item.quantity || 0), 0);
  const inOrder = (productId: string, variantId?: string) =>
    items
      .filter(
        (item) =>
          item.productId === productId && (variantId === undefined || item.variantId === variantId)
      )
      .reduce((total, item) => total + (item.quantity || 0), 0);
  const add = (chosen: OrderProductSelector, variantId?: string) => {
    const found = items.find(
      (item) => item.productId === chosen.id && item.variantId === variantId
    );
    if (!found && items.length >= options.limits.lines) return;
    const next = found
      ? items.map((item) =>
          item === found
            ? { ...item, quantity: Math.min(options.limits.quantity, item.quantity + 1) }
            : item
        )
      : [...items, { productId: chosen.id, variantId, quantity: 1 }];
    onChange({
      form: { ...draft.form, items: next },
      products: [...draft.products.filter((item) => item.id !== chosen.id), chosen],
    });
  };
  const close = () => {
    onMode(null);
    setProduct(null);
  };
  const stock = (available: number, untracked: boolean) =>
    untracked ? t('untracked') : t('available', { count: available });
  return (
    <Sheet
      visible={mode !== null}
      title={product ? product.name : t(mode === 'scan' ? 'scan' : 'addProducts')}
      onClose={close}
      footer={
        <Button
          label={items.length ? t('doneAdding', { count: units }) : t('done')}
          variant="accent"
          onPress={close}
        />
      }>
      {mode === 'scan' ? (
        <BarcodeReader
          onRead={(code) => {
            setSearch('');
            setBarcode(code);
            setProduct(null);
            onMode('search');
          }}
        />
      ) : product ? (
        <View className="gap-3">
          <Button
            label={t('allProducts')}
            icon="arrow-left"
            variant="ghost"
            size="sm"
            className="self-start"
            onPress={() => setProduct(null)}
          />
          <RowGroup bare divider="leading">
            {product.variants.map((variant) => {
              const count = inOrder(product.id, variant.id);
              return (
                <ListRow
                  key={variant.id}
                  leading={
                    <AppImage
                      image={variant.image ?? product.image}
                      size="thumb"
                      decorative
                      className="size-11 rounded-md bg-surface-alt"
                    />
                  }
                  title={variant.name}
                  titleEnd={
                    variant.price ? (
                      <Text variant="price">{variant.price.formatted}</Text>
                    ) : undefined
                  }
                  meta={[variant.sku, stock(variant.available, product.untracked)]
                    .filter(Boolean)
                    .join(' · ')}
                  metaEnd={count ? <InOrder count={count} /> : undefined}
                  accessibilityLabel={variant.name}
                  disabled={!variant.selectable || disabled}
                  onPress={() => add(product, variant.id)}
                />
              );
            })}
          </RowGroup>
          {product.variants
            .filter((variant) => !variant.selectable && variant.reason)
            .map((variant) => (
              <Banner key={variant.id} tone="warning" message={refusal(variant.reason!)} />
            ))}
        </View>
      ) : (
        <View className="gap-3">
          <View className="flex-row items-center gap-2">
            <SearchField
              label={t('searchProducts')}
              value={search}
              maxLength={100}
              className="flex-1"
              onChangeText={(text) => {
                setSearch(text);
                setBarcode('');
              }}
            />
            <IconButton icon="scan-barcode" label={t('scan')} onPress={() => onMode('scan')} />
          </View>
          {barcode ? (
            <View className="flex-row items-center gap-2 self-start rounded-full bg-surface-alt py-1.5 pe-1.5 ps-3.5">
              <Text variant="chip">{t('barcodeFilter', { code: barcode })}</Text>
              <IconButton
                icon="close"
                variant="plain"
                label={t('clearBarcode')}
                className="size-7"
                onPress={() => setBarcode('')}
              />
            </View>
          ) : null}
          {products.isPending ? (
            <LoadingState shape="rows" />
          ) : products.isError ? (
            <ErrorState error={products.error} onRetry={() => void products.refetch()} />
          ) : !products.data?.items.length ? (
            <EmptyState title={t('noProducts')} placement="top" />
          ) : (
            <>
              <RowGroup bare divider="leading">
                {products.data.items.map((item) => {
                  const count = inOrder(item.id);
                  return (
                    <ListRow
                      key={item.id}
                      leading={
                        <AppImage
                          image={item.image}
                          size="thumb"
                          decorative
                          className="size-11 rounded-md bg-surface-alt"
                        />
                      }
                      title={item.name}
                      titleEnd={
                        item.price ? <Text variant="price">{item.price.formatted}</Text> : undefined
                      }
                      // Why it can't be ordered, on its row: a product without
                      // variants never opens to show its variants' reasons.
                      subtitle={!item.selectable && item.reason ? refusal(item.reason) : undefined}
                      accessibilityHint={
                        !item.selectable && item.reason ? refusal(item.reason) : undefined
                      }
                      meta={[
                        item.variants.length
                          ? t('variantCount', { count: item.variants.length })
                          : item.sku,
                        item.vendorName,
                        stock(item.available, item.untracked),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      metaEnd={count ? <InOrder count={count} /> : undefined}
                      chevron={item.variants.length > 0}
                      accessibilityLabel={item.name}
                      disabled={disabled || !item.selectable}
                      onPress={() => (item.variants.length ? setProduct(item) : add(item))}
                    />
                  );
                })}
              </RowGroup>
              {products.hasNextPage ? (
                <Button
                  label={t('loadMore')}
                  variant="secondary"
                  size="sm"
                  className="self-center"
                  loading={products.isFetchingNextPage}
                  onPress={() => void products.fetchNextPage()}
                />
              ) : null}
            </>
          )}
        </View>
      )}
    </Sheet>
  );
}

/** How many of a product the order holds already, on its row in the picker. */
function InOrder({ count }: { count: number }) {
  const t = useTranslations('orders.create');
  return (
    <View className="rounded-full bg-primary px-2 py-0.5">
      <Text variant="status" className="text-primary-foreground">
        {t('inOrder', { count })}
      </Text>
    </View>
  );
}

/** The camera, reading a code once, or the code typed in. */
function BarcodeReader({ onRead }: { onRead: (code: string) => void }) {
  const t = useTranslations('orders.create');
  const cameraText = useTranslations('products.scanner');
  const [permission, requestPermission, readPermission] = useCameraPermissions();
  const [error, setError] = useState<unknown>(null);
  const [code, setCode] = useState('');
  const describe = useErrorMessage();
  const read = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void readPermission().catch(setError);
    });
    return () => subscription.remove();
  }, [readPermission]);
  return (
    <View className="gap-4">
      {permission?.granted ? (
        <View className="overflow-hidden rounded-lg">
          <CameraView
            style={{ height: 260 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a', 'code128'] }}
            onBarcodeScanned={(event) => {
              const value = event.data.trim();
              if (read.current || !value || value.length > 64) return;
              read.current = true;
              onRead(value);
            }}
          />
        </View>
      ) : (
        <View className="items-center gap-3 rounded-lg bg-surface-alt p-5">
          <Icon name="camera" colorClassName="accent-muted" />
          <Text className="text-center">
            {cameraText(permission?.canAskAgain === false ? 'deniedBody' : 'permissionBody')}
          </Text>
          <Button
            label={cameraText(
              permission?.canAskAgain === false ? 'openSettings' : 'permissionAction'
            )}
            size="sm"
            onPress={() => {
              void (
                permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()
              ).catch(setError);
            }}
          />
        </View>
      )}
      {error ? <Banner tone="danger" message={describe(error)} /> : null}
      <Text variant="caption">{cameraText('hint')}</Text>
      <TextField
        label={t('barcode')}
        value={code}
        maxLength={64}
        autoCapitalize="none"
        onChangeText={setCode}
        onSubmitEditing={() => code.trim() && onRead(code.trim())}
        end={
          <Button
            label={t('findBarcode')}
            variant="ghost"
            size="sm"
            disabled={!code.trim()}
            onPress={() => onRead(code.trim())}
          />
        }
      />
    </View>
  );
}

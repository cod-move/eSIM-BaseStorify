import { onlineManager } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError, isNetworkError } from '@/api/errors';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { RadioRow, RowGroup } from '@/components/ui/rows';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField, type TextFieldProps } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { PRODUCT_STATUSES, type Money, type ProductDetail } from '@/contracts/mobile/biz/v1';
import { useStatusLabel } from '@/features/status/status-chip';
import { useErrorMessage } from '@/i18n/use-error-message';

import { ProductChangedError, changesSince, type OtherChange } from './product-changes';
import {
  changesOf,
  formKeyOf,
  formOf,
  isEmptyChange,
  withCurrentValues,
  type FormErrors,
  type PriceFields,
  type ProductForm,
} from './product-form';
import { useUpdateProduct } from './use-products';

type ProductEditSheetProps = {
  visible: boolean;
  /** The product as the screen shows it; the edit starts from it each time the sheet opens. */
  product: ProductDetail;
  onClose: () => void;
};

/**
 * The quick edit of a product: its status, and its
 * price and compare-at price, or its variants' prices. Only what was changed
 * is sent, with the version the edit started from (`If-Match`).
 *
 * When somebody else changed the same fields meanwhile (a 412 that
 * `useUpdateProduct` could not settle by itself), the sheet stays open: those
 * fields take the store's values, a banner says what changed from what to
 * what, and the operator decides whether to save again.
 */
export function ProductEditSheet({ visible, product, onClose }: ProductEditSheetProps) {
  const t = useTranslations('products');
  const common = useTranslations('common');
  const statusWord = useStatusLabel();
  const describe = useErrorMessage();
  const toast = useToast();
  const update = useUpdateProduct(product.id);
  const [base, setBase] = useState(product);
  const [form, setForm] = useState<ProductForm>(() => formOf(product));
  const [conflict, setConflict] = useState<OtherChange[]>([]);
  const [checked, setChecked] = useState(false);
  const [refused, setRefused] = useState<FormErrors>({});
  const [wasVisible, setWasVisible] = useState(visible);

  // Opened again: the edit starts from the product as it is now.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setBase(product);
      setForm(formOf(product));
      setConflict([]);
      setChecked(false);
      setRefused({});
    }
  }

  const { changes, errors } = changesOf(base, form);
  // Checked when Save is tapped, then live; the store's own refusals until the next change.
  const shown: FormErrors = { ...(checked ? errors : {}), ...refused };
  const errorOf = (key: string) => (shown[key] ? t(`edit.${shown[key]}`) : undefined);
  const currency = (base.price ?? base.variants.find((variant) => variant.price)?.price)?.currency;

  const edit = (next: ProductForm) => {
    setForm(next);
    setRefused({});
  };
  const editVariant = (id: string, fields: Partial<PriceFields>) => {
    const now = form.variants[id] ?? { price: '', compareAtPrice: '' };
    edit({ ...form, variants: { ...form.variants, [id]: { ...now, ...fields } } });
  };

  const fieldName = (change: OtherChange) => {
    const field = t(
      change.field === 'status'
        ? 'edit.status'
        : change.field === 'price'
          ? 'edit.price'
          : 'edit.compareAt'
    );
    const variant = base.variants.find((candidate) => candidate.id === change.variantId);
    return variant ? t('edit.variantField', { variant: variant.name, field }) : field;
  };
  const valueWords = (value: Money | string | undefined) =>
    value === undefined
      ? t('detail.none')
      : typeof value === 'string'
        ? statusWord('product', value)
        : value.formatted;

  async function save() {
    setChecked(true);
    if (Object.keys(errors).length > 0 || isEmptyChange(changes)) return;
    // Read before the change goes: the phone can lose its connection while it
    // is on its way, after the store has already made it.
    const online = onlineManager.isOnline();
    try {
      await update.mutateAsync({ changes, base });
      toast.show({ message: t('edit.saved'), tone: 'success' });
      onClose();
    } catch (error) {
      if (error instanceof ProductChangedError) {
        const changed = changesSince(changes, base, error.product);
        setConflict(changed);
        setBase(error.product);
        setForm((now) => withCurrentValues(now, changed));
        return;
      }
      if (isApiError(error) && error.errors) {
        if (error.errors.preorder) {
          toast.show({ message: t('edit.preorder'), tone: 'danger' });
          return;
        }
        const fields = Object.keys(error.errors)
          .map((key) => formKeyOf(key, changes))
          .filter((key): key is string => key !== null);
        if (fields.length > 0) {
          setRefused(Object.fromEntries(fields.map((key) => [key, 'invalid'])));
          return;
        }
      }
      if (isNetworkError(error)) {
        // No answer: the change may have been saved. The page under the sheet
        // is read again (`useUpdateProduct`); saving again is settled by the 412 rule.
        toast.show(
          online
            ? { message: t('edit.noAnswer'), tone: 'danger' }
            : { message: common('notSentOffline'), tone: 'offline' }
        );
        return;
      }
      toast.show({ message: describe(error), tone: 'danger' });
    }
  }

  return (
    <Sheet
      visible={visible}
      title={t('edit.title')}
      onClose={update.isPending ? () => undefined : onClose}
      footer={
        <Button
          label={t('edit.save')}
          variant="accent"
          loading={update.isPending}
          // Waits for an edit; an edit that cannot be sent still lets Save say why.
          disabled={isEmptyChange(changes) && Object.keys(errors).length === 0}
          onPress={() => void save()}
        />
      }>
      <View className="gap-6">
        {conflict.length > 0 ? (
          <Banner
            tone="warning"
            title={t('edit.changedTitle')}
            message={[
              t('edit.changedBody'),
              ...conflict.map((change) =>
                t('edit.change', {
                  field: fieldName(change),
                  before: valueWords(change.before),
                  after: valueWords(change.after),
                })
              ),
            ].join('\n')}
          />
        ) : null}

        <View className="gap-1">
          <Text variant="section">{t('edit.status')}</Text>
          <RowGroup bare accessibilityRole="radiogroup">
            {PRODUCT_STATUSES.map((status) => (
              <RadioRow
                key={status}
                title={statusWord('product', status)}
                description={t(`edit.statusHint.${status}`)}
                selected={form.status === status}
                onSelect={() => edit({ ...form, status })}
                className="px-0"
              />
            ))}
          </RowGroup>
        </View>

        {base.priceOnRequest ? (
          <Text className="text-muted">{t('edit.onRequest')}</Text>
        ) : base.variants.length === 0 ? (
          <View className="gap-4">
            <PriceField
              label={t('edit.price')}
              currency={currency}
              value={form.price}
              onChangeText={(price) => edit({ ...form, price })}
              error={errorOf('price')}
            />
            <PriceField
              label={t('edit.compareAt')}
              currency={currency}
              value={form.compareAtPrice}
              onChangeText={(compareAtPrice) => edit({ ...form, compareAtPrice })}
              error={errorOf('compareAtPrice')}
              hint={t('edit.compareAtHint')}
              optional
            />
          </View>
        ) : (
          <View className="gap-5">
            <Text variant="section">{t('edit.prices')}</Text>
            {base.variants.map((variant) => {
              const fields = form.variants[variant.id] ?? { price: '', compareAtPrice: '' };
              return (
                <View key={variant.id} className="gap-3">
                  <Text variant="label">{variant.name}</Text>
                  <View className="flex-row gap-3">
                    <PriceField
                      label={t('edit.price')}
                      accessibilityLabel={t('edit.variantField', {
                        variant: variant.name,
                        field: t('edit.price'),
                      })}
                      currency={currency}
                      value={fields.price}
                      onChangeText={(price) => editVariant(variant.id, { price })}
                      error={errorOf(`${variant.id}.price`)}
                      className="flex-1"
                    />
                    <PriceField
                      label={t('edit.compareAt')}
                      accessibilityLabel={t('edit.variantField', {
                        variant: variant.name,
                        field: t('edit.compareAt'),
                      })}
                      currency={currency}
                      value={fields.compareAtPrice}
                      onChangeText={(compareAtPrice) => editVariant(variant.id, { compareAtPrice })}
                      error={errorOf(`${variant.id}.compareAtPrice`)}
                      className="flex-1"
                    />
                  </View>
                </View>
              );
            })}
            <Text variant="caption">{t('edit.compareAtHint')}</Text>
          </View>
        )}
      </View>
    </Sheet>
  );
}

/** A price field: the number pad, and the currency's code at its end. */
function PriceField({ currency, ...props }: TextFieldProps & { currency?: string }) {
  return (
    <TextField
      keyboardType="decimal-pad"
      inputMode="decimal"
      autoCorrect={false}
      // A browser's input is otherwise as wide as twenty characters, past a narrow box.
      inputClassName="min-w-0"
      end={
        currency ? (
          <Text variant="meta" className="pe-3">
            {currency}
          </Text>
        ) : undefined
      }
      {...props}
    />
  );
}

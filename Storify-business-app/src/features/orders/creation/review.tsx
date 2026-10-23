import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { ApiError } from '@/api/errors';
import { AppImage } from '@/components/ui/app-image';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-sections';
import { Price } from '@/components/ui/price';
import { ValueRow } from '@/components/ui/rows';
import { SwitchSection } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { ManualOrderFormOptions } from '@/contracts/mobile/biz/v1';
import { useCan } from '@/features/workspace/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { addressLines } from './controls';
import type { CreationDraft } from './draft';

/**
 * The store's quote for the draft, as the order will be: its lines, who and
 * where, how it is paid and the totals. Every amount is the store's. Each card
 * can go back to editing.
 */
export function CreationReview({
  draft,
  options,
  onChange,
  onEdit,
  disabled,
  expired,
}: {
  draft: CreationDraft;
  options: ManualOrderFormOptions;
  onChange: (changes: Partial<CreationDraft>) => void;
  onEdit: () => void;
  disabled: boolean;
  expired: boolean;
}) {
  const t = useTranslations('orders.create');
  const format = useFormatter();
  const describe = useErrorMessage();
  const canRecord = useCan('RECORD_ORDER_PAYMENTS');
  const quote = draft.quote;
  if (!quote) return <Text>{t('reviewHint')}</Text>;
  const edit = (
    <Button label={t('edit')} variant="ghost" size="sm" disabled={disabled} onPress={onEdit} />
  );
  const image = (productId: string, variantId?: string) => {
    const product = draft.products.find((item) => item.id === productId);
    return product?.variants.find((item) => item.id === variantId)?.image ?? product?.image;
  };
  const payment = t.has(`payments.${quote.payment.method}` as never)
    ? t(`payments.${quote.payment.method}` as never)
    : quote.payment.label;
  const units = quote.lines.reduce((total, line) => total + line.quantity, 0);
  return (
    <>
      <Banner
        tone={expired ? 'warning' : 'info'}
        message={
          expired
            ? t('quoteExpired')
            : t('quoteExpires', {
                time: format.dateTime(new Date(draft.quoteValidUntil ?? quote.expiresAt), {
                  hour: 'numeric',
                  minute: '2-digit',
                }),
              })
        }
      />
      <FormSection
        id="review-items"
        icon="package"
        title={t('sections.items')}
        summary={t('itemsSummary', { lines: quote.lines.length, units })}
        action={edit}>
        <View>
          {quote.lines.map((line, index) => (
            <View
              key={index}
              className={cn(
                'flex-row items-center gap-3 py-3',
                index > 0 && 'border-t border-border'
              )}>
              <AppImage
                image={image(line.productId, line.variantId)}
                size="thumb"
                decorative
                className="size-12 rounded-md bg-surface-alt"
              />
              <View className="flex-1 gap-0.5">
                <Text variant="label" numberOfLines={2}>
                  {line.name}
                </Text>
                <Text variant="meta" numberOfLines={1}>
                  {[
                    line.variantName,
                    t('lineQuantity', { count: line.quantity, price: line.unitPrice.formatted }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {line.vendorName ? <Text variant="caption">{line.vendorName}</Text> : null}
              </View>
              <Price money={line.total} />
            </View>
          ))}
        </View>
      </FormSection>
      <FormSection
        id="review-customer"
        icon="user"
        title={t('sections.customer')}
        summary={quote.customer.name}
        action={edit}>
        <View className="gap-4">
          {quote.customer.email || quote.customer.phone ? (
            <View className="gap-0.5">
              {[quote.customer.email, quote.customer.phone].filter(Boolean).map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </View>
          ) : null}
          <AddressBlock
            title={quote.delivery.kind === 'pickup' ? quote.delivery.label : t('shippingAddress')}
            lines={
              draft.form.shippingAddress
                ? [
                    draft.form.shippingAddress.name,
                    ...addressLines(draft.form.shippingAddress, options.countries),
                    draft.form.shippingAddress.phone,
                  ]
                : [t('pickupHint')]
            }
          />
          {draft.form.billingAddress ? (
            <AddressBlock
              title={t('billingAddress')}
              lines={[
                draft.form.billingAddress.name,
                ...addressLines(draft.form.billingAddress, options.countries),
              ]}
            />
          ) : null}
        </View>
      </FormSection>
      <FormSection
        id="review-payment"
        icon="wallet"
        title={t('sections.payment')}
        summary={payment}
        action={edit}>
        <View className="gap-1">
          <ValueRow
            className="px-0"
            label={t('paymentCustody')}
            value={t(`custody.${quote.payment.custody}`)}
          />
          {draft.form.notes ? (
            <View className="gap-1 pt-2">
              <Text variant="section">{t('notes')}</Text>
              <Text variant="long">{draft.form.notes}</Text>
            </View>
          ) : null}
        </View>
        {canRecord && quote.payment.canRecordPayment ? (
          <SwitchSection
            title={t('recordPayment')}
            description={t('recordPaymentHint')}
            value={draft.recordPayment}
            disabled={disabled || expired}
            onChange={(recordPayment) => onChange({ recordPayment })}>
            <TextField
              label={t('paymentReference')}
              value={draft.paymentReference}
              optional
              maxLength={200}
              editable={!disabled}
              onChangeText={(paymentReference) => onChange({ paymentReference })}
            />
          </SwitchSection>
        ) : (
          <Text variant="caption">{t('paymentHint')}</Text>
        )}
      </FormSection>
      {quote.warnings.map((reason, index) => (
        <Banner
          key={index}
          tone="warning"
          message={describe(new ApiError(409, 'CONFLICT', '', { reason }))}
        />
      ))}
      <View className="gap-1 rounded-xl bg-surface px-4 py-3">
        {(['subtotal', 'shipping', 'tax', 'discount'] as const).map((key) => (
          <ValueRow
            key={key}
            className="min-h-0 px-0 py-1.5"
            label={t(`totals.${key}`)}
            value={quote.totals[key].formatted}
          />
        ))}
        <View
          accessible
          accessibilityLabel={`${t('totals.total')}, ${quote.totals.total.formatted}`}
          className="mt-2 flex-row items-center gap-3 border-t border-border pt-3">
          <Text variant="heading" className="flex-1">
            {t('totals.total')}
          </Text>
          <Price money={quote.totals.total} variant="price-large" />
        </View>
      </View>
    </>
  );
}

function AddressBlock({ title, lines }: { title: string; lines: (string | undefined)[] }) {
  return (
    <View className="gap-1">
      <Text variant="section">{title}</Text>
      {lines.filter(Boolean).map((line, index) => (
        <Text key={index}>{line}</Text>
      ))}
    </View>
  );
}

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { useTabBarHeight } from '@/components/shell/tab-bar';
import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { CheckRow, RadioRow, RowGroup } from '@/components/ui/rows';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type {
  CreateReturnRequest,
  OrderDetail,
  RefundDestinationBody,
  ReturnOptions,
  ShopperReturn,
} from '@/contracts/mobile/shop/v1';
import { ProductLink } from '@/features/catalog/product-link';
import { useErrorMessage } from '@/i18n/use-error-message';

import { ContactStore } from './contact-store';
import { Panel, RefundRows, Row } from './refund-rows';
import { ReturnCard } from './return-card';
import {
  describeRefusal,
  previewRequest,
  setQuantity,
  toggleLine,
  type ReturnSelection,
} from './return-selection';
import { useReturnOptions, useReturnPreview, useSubmitReturn } from './use-returns';

/**
 * "Request a return" for one order. The store decides whether it can be
 * returned: an order it does not mark returnable shows the store's sentence
 * instead, or the way to contact the store when it takes returns only
 * through its team.
 */
export function ReturnRequest({ order }: { order: OrderDetail }) {
  const t = useTranslations('returns');

  if (order.canReturn) return <ReturnOptionsGate order={order} />;
  if (order.returnBlockedReason === 'RETURNS_THROUGH_STORE') {
    return <ContactStore message={order.returnBlockedMessage} />;
  }
  return (
    <EmptyState
      icon="return"
      title={t('notReturnableTitle')}
      body={order.returnBlockedMessage ?? t('notReturnableBody')}
    />
  );
}

function ReturnOptionsGate({ order }: { order: OrderDetail }) {
  const options = useReturnOptions(order.id);

  if (options.isPending) return <LoadingState />;
  if (options.isError) {
    const refusal = describeRefusal(options.error);
    if (refusal.kind === 'contact') return <ContactStore message={refusal.message} />;
    return <ErrorState error={options.error} onRetry={() => void options.refetch()} />;
  }
  return <ReturnForm order={order} options={options.data} />;
}

/** The text of a refusal: the store's own sentence for a return's refusal, ours otherwise. */
function useRefusalText() {
  const describe = useErrorMessage();
  return (error: unknown) => {
    const refusal = describeRefusal(error);
    return refusal.kind === 'message' ? refusal.message : describe(error);
  };
}

/**
 * The stepped flow, on one screen: the items and how many, the store's
 * reason, a note, where the refund goes when the store needs to know, and the
 * store's refund estimate, with "Cancel" and "Submit request". Every line of
 * the order is listed; one the store shuts says why and cannot be chosen.
 */
function ReturnForm({ order, options }: { order: OrderDetail; options: ReturnOptions }) {
  const t = useTranslations('returns');
  const router = useRouter();
  const tabBar = useTabBarHeight();
  const refusalText = useRefusalText();
  const [selection, setSelection] = useState<ReturnSelection>({});
  const [reason, setReason] = useState<string>();
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});

  const request = previewRequest(order, selection, reason);
  const preview = useReturnPreview(order.id, request);
  const submit = useSubmitReturn(order.id);

  if (submit.isSuccess) return <ReturnsMade returns={submit.data.returns} />;

  const refused = describeRefusal(submit.error ?? preview.error);
  if (refused.kind === 'contact') return <ContactStore message={refused.message} />;

  const chosenReason = options.reasons.find((option) => option.code === reason);
  const noteRequired = chosenReason?.noteRequired ?? false;
  const destination = options.refundDestination;
  const destinationRequired =
    destination.required || (preview.data?.refundDestinationRequired ?? false);
  const chosenMethod = destination.methods.find((option) => option.method === method);
  const filled = (key: string) => (fields[key] ?? '').trim();
  const destinationReady =
    !destinationRequired ||
    (chosenMethod !== undefined &&
      chosenMethod.fields.every((field) => !field.required || filled(field.key) !== ''));
  const ready =
    request !== null &&
    preview.isSuccess &&
    (!noteRequired || note.trim() !== '') &&
    destinationReady;

  const send = () => {
    if (!request || !ready) return;
    const refundDestination: RefundDestinationBody | undefined =
      destinationRequired && chosenMethod
        ? {
            ...Object.fromEntries(
              chosenMethod.fields
                .map((field) => [field.key, filled(field.key)] as const)
                .filter(([, value]) => value !== '')
            ),
            method: chosenMethod.method,
          }
        : undefined;
    const body: CreateReturnRequest = {
      ...request,
      note: note.trim() || undefined,
      refundDestination,
    };
    submit.submit(body);
  };

  // Back where the shopper came from; opened from a link, to the order itself.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/account/orders/[id]', params: { id: order.id } });
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}
      keyboardShouldPersistTaps="handled">
      <Panel title={t('itemsStep')}>
        {order.lines.map((line) => {
          const quantity = selection[line.index];
          const max = Math.max(line.returnableQuantity ?? 0, 0);
          // Every line is listed, as on the website; one the store shuts says so and cannot be ticked.
          const status =
            max === 0 && line.returnBlockedReason === 'FINAL_SALE'
              ? t('finalSale')
              : t('returnableOf', { count: max, total: line.quantity });
          return (
            <View key={line.index} className="gap-2">
              <View className="flex-row items-center gap-3">
                {/* The picture opens the product; the row beside it is the choice to return it. */}
                <ProductLink product={line}>
                  <AppImage
                    image={line.image}
                    size="thumb"
                    className="size-12 rounded-md"
                    decorative
                  />
                </ProductLink>
                <CheckRow
                  className="flex-1"
                  title={line.name}
                  description={status}
                  disabled={max === 0}
                  checked={quantity !== undefined}
                  onCheckedChange={(checked) =>
                    setSelection((current) => toggleLine(current, line, checked))
                  }
                />
              </View>
              {quantity !== undefined && max > 1 ? (
                <View className="flex-row items-center justify-between gap-3 ps-[60px]">
                  <Text className="text-muted">{t('quantity')}</Text>
                  <Stepper
                    value={quantity}
                    min={1}
                    max={max}
                    onChange={(next) => setSelection((current) => setQuantity(current, line, next))}
                  />
                </View>
              ) : null}
            </View>
          );
        })}
      </Panel>

      <Panel title={t('reasonStep')}>
        <RowGroup card={false} accessibilityRole="radiogroup">
          {options.reasons.map((option) => (
            <RadioRow
              key={option.code}
              title={option.label}
              selected={option.code === reason}
              onSelect={() => setReason(option.code)}
            />
          ))}
        </RowGroup>
      </Panel>

      <Panel title={t('noteStep')}>
        <TextField
          label={t('noteLabel')}
          optional={!noteRequired}
          required={noteRequired}
          placeholder={t('notePlaceholder')}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={1000}
          on="surface"
          inputClassName="min-h-24"
        />
      </Panel>

      {destinationRequired ? (
        <Panel title={t('destinationStep')}>
          {destination.message ? <Text className="text-muted">{destination.message}</Text> : null}
          <RowGroup card={false} accessibilityRole="radiogroup">
            {destination.methods.map((option) => (
              <RadioRow
                key={option.method}
                title={option.label}
                description={option.note}
                selected={option.method === method}
                onSelect={() => setMethod(option.method)}
              />
            ))}
          </RowGroup>
          {chosenMethod?.fields.map((field) => (
            <TextField
              key={field.key}
              label={field.label}
              placeholder={field.placeholder}
              required={field.required}
              optional={!field.required}
              value={fields[field.key] ?? ''}
              onChangeText={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
              on="surface"
            />
          ))}
        </Panel>
      ) : null}

      <Panel title={t('summaryStep')}>
        {request === null ? (
          <Text className="text-muted">{t('previewHint')}</Text>
        ) : preview.isPending ? (
          <Text className="text-muted">{t('previewLoading')}</Text>
        ) : preview.isError ? (
          <View className="gap-2">
            <Text className="text-danger" accessibilityRole="alert">
              {refusalText(preview.error)}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              label={t('previewRetry')}
              onPress={() => void preview.refetch()}
            />
          </View>
        ) : (
          <View className="gap-4">
            {preview.data.parcels.map((parcel, index) => (
              <View key={parcel.lines.map((line) => line.index).join('-')} className="gap-2">
                {preview.data.parcels.length > 1 ? (
                  <Text variant="caption">{t('parcel', { number: index + 1 })}</Text>
                ) : null}
                {parcel.lines.map((line) => (
                  <Text key={line.index}>
                    {t('previewLine', { name: line.name, count: line.quantity })}
                  </Text>
                ))}
                <RefundRows
                  refund={parcel.refund}
                  refundsShipping={preview.data.refundsShipping}
                  estimated
                />
              </View>
            ))}
            {preview.data.parcels.length > 1 ? (
              <Row label={t('previewTotal')} value={preview.data.total.formatted} strong />
            ) : null}
            {preview.data.storeAtFault ? <Text variant="caption">{t('onUs')}</Text> : null}
            <Text variant="caption">{t('estimateNote')}</Text>
          </View>
        )}
        {submit.isError ? (
          <Text className="text-danger" accessibilityRole="alert">
            {refusalText(submit.error)}
          </Text>
        ) : null}
        <View className="flex-row gap-3">
          <Button variant="ghost" label={t('cancel')} className="flex-1 px-3" onPress={leave} />
          <Button
            variant="accent"
            label={t('submit')}
            className="flex-1 px-3"
            loading={submit.isPending}
            disabled={!ready}
            onPress={send}
          />
        </View>
      </Panel>
    </ScrollView>
  );
}

/** The store's answer: one return per seller, each shown as it stands. */
function ReturnsMade({ returns }: { returns: ShopperReturn[] }) {
  const t = useTranslations('returns');
  const router = useRouter();
  const tabBar = useTabBarHeight();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 px-4 pt-3"
      contentContainerStyle={{ paddingBottom: tabBar + 16 }}>
      <View className="gap-1 py-2">
        <Text variant="subheading" accessibilityRole="header">
          {t('requestedTitle')}
        </Text>
        <Text className="text-muted">{t('requestedBody', { count: returns.length })}</Text>
      </View>
      {returns.map((item) => (
        <View key={item.id} className="gap-2">
          <ReturnCard item={item} />
          {item.instructions ? <Text className="px-1">{item.instructions}</Text> : null}
        </View>
      ))}
      <Button
        variant="secondary"
        label={t('seeReturns')}
        onPress={() => router.replace('/account/returns')}
      />
    </ScrollView>
  );
}

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Screen, StackHeader, ActionBar } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { ValueRow, RowGroup } from '@/components/ui/rows';
import { Banner } from '@/components/ui/banner';
import { ConfirmSheet } from '@/components/ui/sheet';
import { LoadingState } from '@/components/ui/state-view';
import {
  RefundPreviewRequest,
  type RefundPreview,
  type RefundTarget,
  type RefundResult,
} from '@/contracts/mobile/biz/v1';
import { useOrder } from '@/features/orders/use-orders';
import { useOpenDashboard } from '@/features/web/use-open-page';
import { useCan } from '@/features/workspace/use-workspace';
import {
  useRefund,
  useRefundPreview,
  useReturn,
  useReturnDraft,
  useReturnOptions,
  useReturnWrite,
} from './use-returns';
import {
  ReturnBreakdown,
  ReturnChoice,
  ReturnError,
  ReturnMissing,
  ReturnNumber,
  ReturnRecovery,
  ReturnToggle,
  ReturnUnavailable,
  ReturnWarnings,
} from './shared';
import { useReturnNavigation } from './navigation';
export function RefundScreen({ target }: { target: RefundTarget }) {
  const t = useTranslations('returns');
  const order = useOrder(target.kind === 'order' ? target.id : '');
  const returned = useReturn(target.kind === 'return' ? target.id : '');
  const source = target.kind === 'order' ? order : returned;
  // The order's options name the stock locations (and, for a return, offer them).
  const options = useReturnOptions(
    target.kind === 'return' ? (returned.data?.orderId ?? '') : target.id
  );
  const can = useCan('ISSUE_REFUNDS');
  const canSettle = useCan('RECORD_REFUND_SETTLEMENT');
  const draft = useReturnDraft('refund', `${target.kind}:${target.id}`, {
    target,
  } as RefundPreviewRequest);
  const writer = useReturnWrite('refund', `${target.kind}:${target.id}`);
  const preview = useRefundPreview();
  const [review, setReview] = useState<RefundPreview | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState(false);
  const [validation, setValidation] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // In flight: leaving waits for it. An unconfirmed operation only locks the form.
  const blocked = writer.isPending || preview.isPending;
  const locked = blocked || Boolean(writer.attempt) || !can;
  const navigation = useReturnNavigation(
    draft.dirty,
    blocked,
    draft.clear,
    can,
    Boolean(writer.attempt)
  );
  const request = draft.form;
  useEffect(() => {
    if (!review) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [review]);
  const expired =
    review &&
    (!Number.isFinite(Date.parse(review.expiresAt)) || Date.parse(review.expiresAt) <= now);
  const update = (form: RefundPreviewRequest) => {
    if (!locked) {
      draft.set(form);
      setReview(null);
      setValidation(false);
      setError(null);
    }
  };
  const done = (result: RefundResult) => {
    draft.clear();
    navigation.finish(() =>
      router.replace({ pathname: '/refunds/[id]', params: { id: result.refundId } })
    );
  };
  const getPreview = async () => {
    const parsed = RefundPreviewRequest.safeParse(request);
    if (!parsed.success) {
      setValidation(true);
      return;
    }
    try {
      setError(null);
      const quote = await preview.review(parsed.data);
      setNow(Date.now());
      setReview(quote);
    } catch (failure) {
      setError(failure);
    }
  };
  const submit = async () => {
    if (locked || !review) return;
    if (
      !Number.isFinite(Date.parse(review.expiresAt)) ||
      Date.parse(review.expiresAt) <= Date.now()
    ) {
      setReview(null);
      setConfirm(false);
      return;
    }
    try {
      const result = await writer.submit({
        kind: 'refund',
        request: { preview: request, previewToken: review.token },
      });
      setConfirm(false);
      if ('refundId' in result) done(result);
    } catch (failure) {
      setConfirm(false);
      setReview(null);
      setError(failure);
    }
  };
  if (!source.data)
    return (
      <Screen header={<StackHeader title={t('refundTitle')} />}>
        {!target.id ? (
          <ReturnMissing />
        ) : source.isPending ? (
          <LoadingState shape="rows" />
        ) : (
          <ReturnUnavailable error={source.error} retry={() => void source.refetch()} />
        )}
      </Screen>
    );
  const lines =
    target.kind === 'order'
      ? order.data?.lines.map((line) => ({ index: line.index, name: line.name }))
      : returned.data?.items.map((line) => ({ index: line.orderItemIndex, name: line.name }));
  return (
    <Screen
      header={<StackHeader title={t('refundTitle')} onBack={navigation.back} />}
      scroll
      contentClassName="gap-4 px-4"
      footer={
        <ActionBar>
          <Button
            label={t(review && !expired ? 'confirmRefund' : 'reviewRefund')}
            disabled={locked}
            loading={preview.isPending}
            onPress={() => (review && !expired ? setConfirm(true) : void getPreview())}
          />
        </ActionBar>
      }>
      <ReturnError error={error} />
      {validation ? <Banner tone="danger" message={t('validation')} /> : null}
      <ReturnRecovery
        writer={writer}
        onError={setError}
        onResult={(result) => {
          if ('refundId' in result) done(result);
        }}
      />
      {review ? (
        <>
          <ReturnWarnings warnings={review.warnings} />
          <Banner
            tone={expired ? 'warning' : 'info'}
            message={t(expired ? 'quoteExpired' : 'refundReviewHint')}
          />
          <RowGroup>
            <ValueRow label={t('refundAmount')} value={review.amount.formatted} />
            <ValueRow label={t('maximum')} value={review.maximum.formatted} />
            <ValueRow label={t('collected')} value={review.collected.formatted} />
            <ValueRow label={t('refunded')} value={review.previouslyRefunded.formatted} />
            <ValueRow label={t('refundDestination')} value={review.destination.label} />
            <ValueRow label={t('payer')} value={t(`payers.${review.destination.payer}`)} />
          </RowGroup>
          <ReturnBreakdown value={review.breakdown} />
          {review.destination.settlementRequired ? (
            <Banner tone="warning" message={t('manualRequiredHint')} />
          ) : null}
          {review.stock.map((line, index) => (
            <Text key={index}>
              {t('stockEffect', {
                index: line.index + 1,
                count: line.quantity,
                effect: t(`stock.${line.effect}`),
                location:
                  options.data?.locations.find((place) => place.id === line.locationId)?.name ?? '',
              })}
            </Text>
          ))}
          <Button
            label={t('editDraft')}
            variant="secondary"
            disabled={locked}
            onPress={() => setReview(null)}
          />
        </>
      ) : (
        <>
          <Text variant="caption">{t('refundAmountHint')}</Text>
          <ReturnNumber
            label={t('refundAmount')}
            value={request.amount}
            optional
            disabled={locked}
            onChange={(amount) => update({ ...request, amount })}
          />
          {lines?.map((line) => (
            <View key={line.index} className="gap-2">
              <Text>{line.name}</Text>
              <ReturnNumber
                label={t('refundQuantity', { index: line.index + 1 })}
                integer
                value={request.items?.find((i) => i.index === line.index)?.quantity ?? 0}
                disabled={locked}
                onChange={(quantity) => {
                  const items = [
                    ...(request.items ?? []).filter((i) => i.index !== line.index),
                    ...(quantity !== 0
                      ? [{ index: line.index, quantity: quantity ?? Number.NaN }]
                      : []),
                  ];
                  update({ ...request, items: items.length ? items : undefined });
                }}
              />
            </View>
          ))}
          <TextField
            label={t('refundReason')}
            optional
            value={request.reason ?? ''}
            editable={!locked}
            maxLength={500}
            onChangeText={(reason) => update({ ...request, reason })}
          />
          <ReturnNumber
            label={t('deliveryRefund')}
            value={request.deliveryRefund ?? undefined}
            optional
            disabled={locked}
            onChange={(deliveryRefund) => update({ ...request, deliveryRefund })}
          />
          {target.kind === 'return' ? (
            <>
              <ReturnNumber
                label={t('totals.restockingFee')}
                value={request.feeOverride?.restockingFee ?? undefined}
                optional
                disabled={locked}
                onChange={(restockingFee) =>
                  update({ ...request, feeOverride: { ...request.feeOverride, restockingFee } })
                }
              />
              <ReturnNumber
                label={t('totals.returnShippingFee')}
                value={request.feeOverride?.returnShippingFee ?? undefined}
                optional
                disabled={locked}
                onChange={(returnShippingFee) =>
                  update({ ...request, feeOverride: { ...request.feeOverride, returnShippingFee } })
                }
              />
              <ReturnToggle
                label={t('merchantFault')}
                value={Boolean(request.faultOverride)}
                disabled={locked}
                onChange={(enabled) =>
                  update({
                    ...request,
                    faultOverride: enabled ? { merchantAtFault: true, note: '' } : undefined,
                  })
                }>
                {request.faultOverride ? (
                  <TextField
                    label={t('overrideNote')}
                    required
                    maxLength={500}
                    value={request.faultOverride.note ?? ''}
                    editable={!locked}
                    onChangeText={(note) =>
                      update({ ...request, faultOverride: { ...request.faultOverride!, note } })
                    }
                  />
                ) : null}
              </ReturnToggle>
              <ReturnToggle
                label={t('restoreStock')}
                value={Boolean(request.restoreInventory)}
                disabled={locked}
                onChange={(restoreInventory) => update({ ...request, restoreInventory })}>
                {request.restoreInventory && options.data?.locations.length ? (
                  <ReturnChoice
                    label={t('location')}
                    value={request.locationId}
                    choices={options.data.locations.map((location) => ({
                      value: location.id,
                      label: location.name,
                    }))}
                    disabled={locked}
                    onChange={(locationId) => update({ ...request, locationId })}
                  />
                ) : null}
              </ReturnToggle>
            </>
          ) : null}
          {canSettle ? (
            <>
              <ReturnToggle
                label={t('manualSettlement')}
                value={Boolean(request.manual)}
                disabled={locked}
                onChange={(manual) =>
                  update({ ...request, manual, settlement: manual ? { method: '' } : undefined })
                }>
                {request.manual ? (
                  <>
                    <Banner tone="warning" message={t('alreadySentHint')} />
                    <TextField
                      label={t('settlementMethod')}
                      required
                      maxLength={40}
                      value={request.settlement?.method ?? ''}
                      editable={!locked}
                      onChangeText={(method) =>
                        update({ ...request, settlement: { ...request.settlement, method } })
                      }
                    />
                    <TextField
                      label={t('settlementReference')}
                      optional
                      maxLength={200}
                      value={request.settlement?.reference ?? ''}
                      editable={!locked}
                      onChangeText={(reference) =>
                        update({
                          ...request,
                          settlement: { method: request.settlement?.method ?? '', reference },
                        })
                      }
                    />
                  </>
                ) : null}
              </ReturnToggle>
            </>
          ) : null}
        </>
      )}
      <ConfirmSheet
        visible={confirm}
        title={t('confirmRefund')}
        body={t('confirmRefundBody', { amount: review?.amount.formatted ?? '' })}
        confirmLabel={t('confirm')}
        cancelLabel={t('keepEditing')}
        loading={writer.isPending}
        confirmDisabled={locked || Boolean(expired)}
        onConfirm={() => void submit()}
        onCancel={() => setConfirm(false)}
      />
      {navigation.dialog}
    </Screen>
  );
}
export function RefundReceiptScreen({ id }: { id: string }) {
  const t = useTranslations('returns');
  const common = useTranslations('common');
  const query = useRefund(id);
  const result = query.data;
  const canOrder = useCan('VIEW_ORDERS');
  const openDashboard = useOpenDashboard();
  const header = <StackHeader title={t('refundReceipt')} />;
  if (!result)
    return (
      <Screen header={header}>
        {query.isPending ? (
          <LoadingState shape="rows" />
        ) : (
          <ReturnUnavailable error={query.error} retry={() => void query.refetch()} />
        )}
      </Screen>
    );
  // An order's refund has no return to record its settlement on: that is the website's.
  const settleOnWebsite = result.settlementStatus === 'manual_required' && !result.return;
  return (
    <Screen header={header} scroll contentClassName="gap-4 px-4">
      <Banner
        tone={
          result.settlementStatus === 'succeeded'
            ? 'success'
            : result.settlementStatus === 'failed'
              ? 'danger'
              : 'warning'
        }
        title={t(`settlement.${result.settlementStatus}`)}
        message={
          settleOnWebsite ? t('manualOrderHint') : t(`settlementHints.${result.settlementStatus}`)
        }
        action={
          settleOnWebsite && openDashboard
            ? { label: common('openWebsite'), onPress: openDashboard }
            : undefined
        }
      />
      <RowGroup>
        <ValueRow label={t('refundAmount')} value={result.amount.formatted} />
        <ValueRow label={t('receiptId')} value={result.refundId} />
      </RowGroup>
      <Button
        label={t('refreshReceipt')}
        loading={query.isFetching}
        onPress={() => void query.refetch()}
      />
      {result.return ? (
        <Button
          label={t('viewCase')}
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/returns/[id]', params: { id: result.return!.id } })
          }
        />
      ) : null}
      <ReturnWarnings warnings={result.warnings} />
      {result.order && canOrder ? (
        <Button
          label={t('viewOrder')}
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/orders/[id]', params: { id: result.order!.id } })
          }
        />
      ) : null}
      {query.isError ? <ReturnError error={query.error} /> : null}
    </Screen>
  );
}

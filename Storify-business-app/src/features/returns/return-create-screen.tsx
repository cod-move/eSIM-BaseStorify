import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { ActionBar, Screen, StackHeader } from '@/components/ui/screen';
import { ConfirmSheet } from '@/components/ui/sheet';
import { LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Banner } from '@/components/ui/banner';
import {
  ReturnCreateRequest,
  ReturnPreviewRequest,
  type ReturnOptions,
  type ReturnPreview,
  type BizUpload,
  type ReturnCreateResult,
} from '@/contracts/mobile/biz/v1';
import { useCan } from '@/features/workspace/use-workspace';
import { useReturnDraft, useReturnOptions, useReturnPreview, useReturnWrite } from './use-returns';
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
import { ReturnUploads } from './return-uploads';
import { useReturnNavigation } from './navigation';

export function ReturnCreateScreen({ orderId }: { orderId: string }) {
  const t = useTranslations('returns');
  const options = useReturnOptions(orderId);
  if (!options.data)
    return (
      <Screen header={<StackHeader title={t('createTitle')} />}>
        {!orderId ? (
          <ReturnMissing />
        ) : options.isPending ? (
          <LoadingState shape="rows" />
        ) : (
          <ReturnUnavailable error={options.error} retry={() => void options.refetch()} />
        )}
      </Screen>
    );
  return <ReturnCreateForm key={orderId} options={options.data} reload={() => options.refetch()} />;
}
function ReturnCreateForm({
  options,
  reload,
}: {
  options: ReturnOptions;
  reload: () => Promise<{ data?: ReturnOptions }>;
}) {
  const t = useTranslations('returns');
  const can = useCan('HANDLE_RETURNS');
  const draft = useReturnDraft('create', options.orderId, {
    request: {
      orderId: options.orderId,
      version: options.version,
      items: [],
      reason: options.reasons[0]?.code ?? '',
      resolution: 'refund',
      returnMethod: options.methods[0]?.id,
    } as Partial<ReturnCreateRequest>,
    evidence: [] as BizUpload[],
    labels: [] as BizUpload[],
  });
  const writer = useReturnWrite('create', options.orderId);
  const preview = useReturnPreview();
  const [review, setReview] = useState<ReturnPreview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validation, setValidation] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [labelBusy, setLabelBusy] = useState(false);
  // In flight: leaving waits for it. An unconfirmed operation only locks the form.
  const blocked = writer.isPending || evidenceBusy || labelBusy || preview.isPending;
  const locked = blocked || Boolean(writer.attempt) || !can;
  const navigation = useReturnNavigation(
    draft.dirty,
    blocked,
    draft.clear,
    can,
    Boolean(writer.attempt)
  );
  const { request, evidence, labels } = draft.form;
  const update = (request: Partial<ReturnCreateRequest>) => {
    if (locked) return;
    draft.set({ ...draft.form, request });
    setReview(null);
    setError(null);
    setValidation(false);
  };
  const body = () =>
    ReturnCreateRequest.safeParse({
      ...request,
      evidenceIds: evidence.map((f) => f.id),
      // A label picked before the method changed is kept in the draft, not sent.
      labelUploadId: request.returnMethod === 'label' ? labels[0]?.id : undefined,
    });
  const complete = (result: ReturnCreateResult) => {
    draft.clear();
    navigation.finish(() =>
      result.returns.length === 1
        ? router.replace({ pathname: '/returns/[id]', params: { id: result.returns[0]!.id } })
        : router.replace({ pathname: '/returns', params: { orderId: options.orderId, tab: 'all' } })
    );
  };
  const getPreview = async () => {
    const parsed = body();
    const reason = options.reasons.find((r) => r.code === request.reason);
    if (
      !parsed.success ||
      (reason?.noteRequired && !request.note?.trim()) ||
      (reason?.evidenceRequired && !evidence.length)
    ) {
      setValidation(true);
      return;
    }
    try {
      setError(null);
      setReview(await preview.review(ReturnPreviewRequest.parse(parsed.data)));
    } catch (failure) {
      setError(failure);
    }
  };
  const create = async () => {
    const parsed = body();
    if (locked || !review || !parsed.success) return;
    try {
      const result = await writer.submit({ kind: 'create', request: parsed.data });
      setConfirm(false);
      if ('returns' in result) complete(result);
    } catch (failure) {
      setConfirm(false);
      setError(failure);
      setReview(null);
    }
  };
  return (
    <Screen
      header={<StackHeader title={t('createTitle')} onBack={navigation.back} />}
      scroll
      contentClassName="gap-4 px-4"
      footer={
        <ActionBar>
          <Button
            label={t(review ? 'createTitle' : 'create')}
            disabled={locked}
            loading={preview.isPending}
            onPress={() => (review ? setConfirm(true) : void getPreview())}
          />
        </ActionBar>
      }>
      <Text variant="section">{t('order', { number: options.orderNumber })}</Text>
      <ReturnError error={error} />
      {validation ? <Banner tone="danger" message={t('validation')} /> : null}
      <ReturnRecovery
        writer={writer}
        onError={setError}
        onResult={(result) => {
          if ('returns' in result) complete(result);
        }}
      />
      {review ? (
        <>
          <ReturnWarnings warnings={review.warnings} />
          <Text variant="section">{t('previewTitle')}</Text>
          {review.parcels.map((parcel, index) => (
            <View key={index} className="gap-2">
              <Text>{parcel.ownerName}</Text>
              {parcel.items.map((item) => (
                <Text key={item.index}>
                  {t('selectedQuantity', {
                    name: options.lines.find((l) => l.index === item.index)?.name ?? '',
                    count: item.quantity,
                  })}
                </Text>
              ))}
              <ReturnBreakdown value={parcel.refund} />
            </View>
          ))}
          <Text variant="section">{review.total.formatted}</Text>
          <Button
            label={t('editDraft')}
            variant="secondary"
            disabled={locked}
            onPress={() => setReview(null)}
          />
        </>
      ) : (
        <>
          <Text variant="caption">{t('quantityHint')}</Text>
          {options.lines.map((line) => (
            <View key={line.index} className="gap-2">
              <Text variant="label">{line.name}</Text>
              <Text variant="caption">
                {t('eligible', { eligible: line.eligible, ordered: line.ordered })}
              </Text>
              {line.reason ? <Text variant="caption">{line.reason}</Text> : null}
              <ReturnNumber
                label={t('quantity', { index: line.index + 1 })}
                integer
                value={request.items?.find((i) => i.index === line.index)?.quantity ?? 0}
                disabled={locked || (line.eligible === 0 && !request.eligibilityOverride)}
                onChange={(quantity) =>
                  update({
                    ...request,
                    items: [
                      ...(request.items ?? []).filter((i) => i.index !== line.index),
                      ...(quantity !== 0
                        ? [{ index: line.index, quantity: quantity ?? Number.NaN }]
                        : []),
                    ],
                  })
                }
              />
            </View>
          ))}
          <ReturnChoice
            label={t('reason')}
            value={request.reason}
            choices={options.reasons.map((r) => ({ value: r.code, label: r.label }))}
            disabled={locked}
            onChange={(reason) => update({ ...request, reason })}
          />
          <TextField
            label={t('note')}
            optional
            value={request.note ?? ''}
            multiline
            maxLength={1000}
            editable={!locked}
            onChangeText={(note) => update({ ...request, note })}
          />
          <ReturnChoice
            label={t('method')}
            value={request.returnMethod}
            choices={options.methods.map((r) => ({ value: r.id, label: r.label }))}
            disabled={locked}
            onChange={(returnMethod) =>
              update({
                ...request,
                returnMethod: returnMethod as ReturnCreateRequest['returnMethod'],
              })
            }
          />
          {options.canOverride ? (
            <ReturnToggle
              label={t('overrideEligibility')}
              value={Boolean(request.eligibilityOverride)}
              disabled={locked}
              onChange={(enabled) =>
                update({ ...request, eligibilityOverride: enabled ? { note: '' } : undefined })
              }>
              {request.eligibilityOverride ? (
                <TextField
                  label={t('overrideNote')}
                  required
                  value={request.eligibilityOverride.note}
                  editable={!locked}
                  maxLength={500}
                  onChangeText={(note) => update({ ...request, eligibilityOverride: { note } })}
                />
              ) : null}
            </ReturnToggle>
          ) : null}
          <ReturnToggle
            label={t('addDestination')}
            value={Boolean(request.refundDestination)}
            disabled={locked}
            onChange={(enabled) =>
              update({ ...request, refundDestination: enabled ? { method: '' } : undefined })
            }>
            {request.refundDestination
              ? (['method', 'accountName', 'accountNumber', 'provider'] as const).map((field) => (
                  <TextField
                    key={field}
                    label={t(`destination.${field}`)}
                    value={request.refundDestination?.[field] ?? ''}
                    editable={!locked}
                    maxLength={200}
                    required={field === 'method'}
                    onChangeText={(text) =>
                      update({
                        ...request,
                        refundDestination: { ...request.refundDestination!, [field]: text },
                      })
                    }
                  />
                ))
              : null}
          </ReturnToggle>
          {options.uploads.find((p) => p.purpose === 'return_evidence') ? (
            <ReturnUploads
              target={{ kind: 'order', id: options.orderId }}
              policy={options.uploads.find((p) => p.purpose === 'return_evidence')!}
              files={evidence}
              disabled={writer.isPending || Boolean(writer.attempt) || !can}
              onBusy={setEvidenceBusy}
              onFiles={(evidence) => {
                draft.set({ ...draft.form, evidence });
                setReview(null);
              }}
            />
          ) : null}
          {request.returnMethod === 'label' &&
          options.uploads.find((p) => p.purpose === 'return_label') ? (
            <ReturnUploads
              target={{ kind: 'order', id: options.orderId }}
              policy={options.uploads.find((p) => p.purpose === 'return_label')!}
              files={labels}
              disabled={writer.isPending || Boolean(writer.attempt) || !can}
              onBusy={setLabelBusy}
              onFiles={(labels) => {
                draft.set({ ...draft.form, labels });
                setReview(null);
              }}
            />
          ) : null}
        </>
      )}
      <Button
        label={t('reload')}
        variant="ghost"
        disabled={locked}
        onPress={() =>
          void reload()
            .then(({ data }) => {
              if (data) {
                draft.set({ ...draft.form, request: { ...request, version: data.version } });
                setReview(null);
                setError(null);
              }
            })
            .catch(setError)
        }
      />
      <ConfirmSheet
        visible={confirm}
        title={t('confirmCreate')}
        body={t('confirmCreateBody')}
        confirmLabel={t('confirm')}
        cancelLabel={t('keepEditing')}
        loading={writer.isPending}
        confirmDisabled={locked}
        onConfirm={() => void create()}
        onCancel={() => setConfirm(false)}
      />
      {navigation.dialog}
    </Screen>
  );
}

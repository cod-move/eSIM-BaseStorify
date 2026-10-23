import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { ActionBar, Screen, StackHeader } from '@/components/ui/screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Banner } from '@/components/ui/banner';
import { ConfirmSheet } from '@/components/ui/sheet';
import { LoadingState } from '@/components/ui/state-view';
import {
  ReturnActionRequest,
  RETURN_ACTIONS,
  RETURN_CONDITIONS,
  type ReturnCase,
  type ReturnOptions,
  type BizUpload,
} from '@/contracts/mobile/biz/v1';
import { useCan } from '@/features/workspace/use-workspace';
import { ReturnUploads } from './return-uploads';
import { useReturn, useReturnOptions, useReturnDraft, useReturnWrite } from './use-returns';
import {
  ReturnBreakdown,
  ReturnChoice,
  ReturnError,
  ReturnNumber,
  ReturnRecovery,
  ReturnUnavailable,
} from './shared';
import { useReturnNavigation } from './navigation';

export function ReturnActionScreen({ id, action }: { id: string; action: string }) {
  const t = useTranslations('returns');
  const query = useReturn(id);
  const options = useReturnOptions(query.data?.orderId ?? '');
  const parsed = ReturnActionRequest.shape.action.safeParse(action);
  if (!parsed.success)
    return (
      <Screen header={<StackHeader title={t('title')} />}>
        <Banner tone="warning" message={t('actionUnavailable')} />
      </Screen>
    );
  if (!query.data || !options.data)
    return (
      <Screen header={<StackHeader title={t(`actions.${parsed.data}`)} />}>
        {query.isError || options.isError ? (
          <ReturnUnavailable
            error={query.error ?? options.error}
            retry={() => {
              void query.refetch();
              void options.refetch();
            }}
          />
        ) : (
          <LoadingState shape="rows" />
        )}
      </Screen>
    );
  return (
    <ActionForm
      key={`${id}:${action}`}
      row={query.data}
      options={options.data}
      action={parsed.data}
      reload={() => query.refetch()}
    />
  );
}
function ActionForm({
  row,
  options,
  action,
  reload,
}: {
  row: ReturnCase;
  options: ReturnOptions;
  action: (typeof RETURN_ACTIONS)[number];
  reload: () => Promise<{ data?: ReturnCase }>;
}) {
  const t = useTranslations('returns');
  const can = useCan('HANDLE_RETURNS');
  const writer = useReturnWrite('action', row.id);
  const draft = useReturnDraft('action', row.id, {
    request: {
      action,
      version: row.version,
      ...(action === 'approve'
        ? {
            approvedItems: row.items.map((i) => ({
              index: i.orderItemIndex,
              quantity: i.quantityRequested,
            })),
          }
        : {}),
      ...(action === 'record_receipt'
        ? {
            receivedItems: row.items.map((i) => ({
              index: i.orderItemIndex,
              quantity: i.quantityReceived ?? 0,
              // Recorded again: the condition already recorded, when the app knows the word.
              condition: RETURN_CONDITIONS.find((known) => known === i.condition) ?? 'new',
            })),
          }
        : {}),
      ...(action === 'restock' ? { restockItems: [] } : {}),
      ...(action === 'record_disposition' ? { dispositions: [] } : {}),
    } as Partial<ReturnActionRequest>,
    labels: [] as BizUpload[],
  });
  const request =
    draft.form.request.action === action
      ? draft.form.request
      : ({ action, version: row.version } as Partial<ReturnActionRequest>);
  const [error, setError] = useState<unknown>(null);
  const [validation, setValidation] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  // In flight: leaving waits for it. An unconfirmed operation only locks the form.
  const blocked = writer.isPending || uploadBusy;
  const locked = blocked || Boolean(writer.attempt) || !can || !row.actions.includes(action);
  const navigation = useReturnNavigation(
    draft.dirty,
    blocked,
    draft.clear,
    can,
    Boolean(writer.attempt)
  );
  const update = (request: Partial<ReturnActionRequest>) => {
    if (!locked) {
      draft.set({ ...draft.form, request });
      setError(null);
      setValidation(false);
    }
  };
  const done = () => {
    draft.clear();
    // Back to the return it came from, which shows the store's answer; never a second copy of it.
    navigation.finish(() =>
      router.canGoBack()
        ? router.back()
        : router.replace({ pathname: '/returns/[id]', params: { id: row.id } })
    );
  };
  const submit = async () => {
    if (locked) return;
    const parsed = ReturnActionRequest.safeParse({
      ...request,
      // A disposition chosen for an item left at 0 is kept in the draft, not sent.
      ...(request.dispositions
        ? { dispositions: request.dispositions.filter((i) => i.quantity !== 0) }
        : {}),
      // A label picked before the method changed is kept in the draft, not sent.
      labelUploadId: request.returnMethod === 'label' ? draft.form.labels[0]?.id : undefined,
    });
    if (
      !parsed.success ||
      (action === 'reject' && !request.reason?.trim()) ||
      (action === 'record_settlement' && !request.settlement?.method.trim())
    ) {
      setValidation(true);
      setConfirm(false);
      return;
    }
    try {
      await writer.submit({ kind: 'action', id: row.id, request: parsed.data });
      setConfirm(false);
      done();
    } catch (failure) {
      setConfirm(false);
      setError(failure);
    }
  };
  return (
    <Screen
      header={<StackHeader title={t(`actions.${action}`)} onBack={navigation.back} />}
      scroll
      contentClassName="gap-4 px-4"
      footer={
        <ActionBar>
          <Button label={t('reviewAction')} disabled={locked} onPress={() => setConfirm(true)} />
        </ActionBar>
      }>
      <Text variant="section">{t('caseTitle', { number: row.number })}</Text>
      <ReturnError error={error} />
      {!row.actions.includes(action) && !writer.attempt ? (
        <Banner tone="warning" message={t('actionUnavailable')} />
      ) : null}
      {validation ? <Banner tone="danger" message={t('validation')} /> : null}
      <ReturnRecovery writer={writer} onError={setError} onResult={done} />
      <ReturnBreakdown value={row.estimate} />
      {(['approve', 'record_receipt', 'restock', 'record_disposition'] as string[]).includes(action)
        ? row.items.map((item) => {
            const index = item.orderItemIndex;
            const quantity =
              action === 'approve'
                ? request.approvedItems?.find((i) => i.index === index)?.quantity
                : action === 'record_receipt'
                  ? request.receivedItems?.find((i) => i.index === index)?.quantity
                  : action === 'restock'
                    ? request.restockItems?.find((i) => i.index === index)?.quantity
                    : request.dispositions?.find((i) => i.index === index)?.quantity;
            return (
              <View key={index} className="gap-3 rounded-xl bg-surface p-3">
                <Text variant="label">{item.name}</Text>
                <Text variant="caption">
                  {t('caseQuantities', {
                    requested: item.quantityRequested,
                    approved: item.quantityApproved,
                    received: item.quantityReceived ?? 0,
                    restocked: item.quantityRestocked,
                    held: item.quantityHeld ?? 0,
                  })}
                </Text>
                <ReturnNumber
                  label={t('quantity', { index: index + 1 })}
                  value={quantity ?? 0}
                  integer
                  disabled={locked}
                  onChange={(quantity) => {
                    const next = quantity ?? Number.NaN;
                    if (action === 'approve')
                      update({
                        ...request,
                        approvedItems: [
                          ...(request.approvedItems ?? []).filter((i) => i.index !== index),
                          { index, quantity: next },
                        ],
                      });
                    else if (action === 'record_receipt')
                      update({
                        ...request,
                        receivedItems: [
                          ...(request.receivedItems ?? []).filter((i) => i.index !== index),
                          {
                            index,
                            quantity: next,
                            condition:
                              request.receivedItems?.find((i) => i.index === index)?.condition ??
                              'new',
                          },
                        ],
                      });
                    else if (action === 'restock')
                      update({
                        ...request,
                        restockItems: [
                          ...(request.restockItems ?? []).filter((i) => i.index !== index),
                          ...(next !== 0 ? [{ index, quantity: next }] : []),
                        ],
                      });
                    else
                      update({
                        ...request,
                        dispositions: [
                          ...(request.dispositions ?? []).filter((i) => i.index !== index),
                          {
                            index,
                            quantity: next,
                            action:
                              request.dispositions?.find((i) => i.index === index)?.action ??
                              ('written_off' as const),
                          },
                        ],
                      });
                  }}
                />
                {action === 'record_receipt' ? (
                  <ReturnChoice
                    label={t('conditionFor', { index: index + 1 })}
                    value={
                      request.receivedItems?.find((i) => i.index === index)?.condition ?? 'new'
                    }
                    choices={RETURN_CONDITIONS.map((value) => ({
                      value,
                      label: t(`conditions.${value}`),
                    }))}
                    disabled={locked}
                    onChange={(condition) =>
                      update({
                        ...request,
                        receivedItems: [
                          ...(request.receivedItems ?? []).filter((i) => i.index !== index),
                          {
                            index,
                            quantity: quantity ?? 0,
                            condition: condition as (typeof RETURN_CONDITIONS)[number],
                          },
                        ],
                      })
                    }
                  />
                ) : null}
                {action === 'record_disposition' ? (
                  <ReturnChoice
                    label={t('dispositionFor', { index: index + 1 })}
                    value={
                      request.dispositions?.find((i) => i.index === index)?.action ?? 'written_off'
                    }
                    choices={(['restocked', 'written_off'] as const).map((value) => ({
                      value,
                      label: t(`dispositions.${value}`),
                    }))}
                    disabled={locked}
                    onChange={(disposition) =>
                      update({
                        ...request,
                        // Kept while the quantity is still 0, for when it is typed.
                        dispositions: [
                          ...(request.dispositions ?? []).filter((i) => i.index !== index),
                          {
                            index,
                            quantity: quantity ?? 0,
                            action: disposition as 'restocked' | 'written_off',
                          },
                        ],
                      })
                    }
                  />
                ) : null}
              </View>
            );
          })
        : null}
      {(['approve', 'restock', 'record_disposition'] as string[]).includes(action) &&
      options.locations.length ? (
        <ReturnChoice
          label={t('location')}
          value={request.locationId}
          choices={options.locations.map((i) => ({ value: i.id, label: i.name }))}
          disabled={locked}
          onChange={(locationId) => update({ ...request, locationId })}
        />
      ) : null}
      {action === 'approve' ? (
        <>
          <ReturnChoice
            label={t('method')}
            value={request.returnMethod ?? row.returnMethod}
            choices={options.methods.map((r) => ({ value: r.id, label: r.label }))}
            disabled={locked}
            onChange={(returnMethod) =>
              update({
                ...request,
                returnMethod: returnMethod as ReturnActionRequest['returnMethod'],
              })
            }
          />
          {request.returnMethod === 'label' &&
          options.uploads.find((p) => p.purpose === 'return_label') ? (
            <ReturnUploads
              target={{ kind: 'return', id: row.id }}
              policy={options.uploads.find((p) => p.purpose === 'return_label')!}
              files={draft.form.labels}
              disabled={writer.isPending || Boolean(writer.attempt) || !can}
              onBusy={setUploadBusy}
              onFiles={(labels) => draft.set({ ...draft.form, request, labels })}
            />
          ) : null}
        </>
      ) : null}
      {action === 'reject' ? (
        <TextField
          label={t('rejectionReason')}
          required
          value={request.reason ?? ''}
          editable={!locked}
          multiline
          maxLength={1000}
          onChangeText={(reason) => update({ ...request, reason })}
        />
      ) : null}
      {action === 'record_tracking' ? (
        <>
          <TextField
            label={t('carrier')}
            optional
            value={request.carrier ?? ''}
            editable={!locked}
            maxLength={100}
            onChangeText={(carrier) => update({ ...request, carrier })}
          />
          <TextField
            label={t('tracking')}
            required
            value={request.trackingNumber ?? ''}
            editable={!locked}
            maxLength={100}
            onChangeText={(trackingNumber) => update({ ...request, trackingNumber })}
          />
        </>
      ) : null}
      {action === 'record_settlement' ? (
        <>
          <Banner tone="warning" message={t('alreadySentHint')} />
          <TextField
            label={t('settlementMethod')}
            required
            value={request.settlement?.method ?? ''}
            editable={!locked}
            maxLength={40}
            onChangeText={(method) =>
              update({ ...request, settlement: { ...request.settlement, method } })
            }
          />
          <TextField
            label={t('settlementReference')}
            optional
            value={request.settlement?.reference ?? ''}
            editable={!locked}
            maxLength={200}
            onChangeText={(reference) =>
              update({
                ...request,
                settlement: { method: request.settlement?.method ?? '', reference },
              })
            }
          />
        </>
      ) : null}
      <TextField
        label={t('note')}
        optional
        value={request.note ?? ''}
        editable={!locked}
        multiline
        maxLength={2000}
        onChangeText={(note) => update({ ...request, note })}
      />
      <Button
        label={t('reload')}
        variant="ghost"
        disabled={locked}
        onPress={() =>
          void reload()
            .then(({ data }) => {
              if (data) update({ ...request, version: data.version });
            })
            .catch(setError)
        }
      />
      <ConfirmSheet
        visible={confirm}
        title={t(`actions.${action}`)}
        body={t(action === 'record_settlement' ? 'confirmSettlement' : 'confirmAction')}
        confirmLabel={t('confirm')}
        cancelLabel={t('keepEditing')}
        loading={writer.isPending}
        confirmDisabled={locked}
        onConfirm={() => void submit()}
        onCancel={() => setConfirm(false)}
      />
      {navigation.dialog}
    </Screen>
  );
}

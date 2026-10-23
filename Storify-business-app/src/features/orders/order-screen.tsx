import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { ActionRow, NavRow, RowGroup } from '@/components/ui/rows';
import { ActionBar, Screen, StackHeader } from '@/components/ui/screen';
import { ErrorState, InlineError, LoadingState } from '@/components/ui/state-view';
import type { OrderAction, OrderConsignment, OrderDetail } from '@/contracts/mobile/biz/v1';
import { useCan, useWorkspace } from '@/features/workspace/use-workspace';
import { usePullToRefresh } from '@/lib/use-pull-to-refresh';

import { CancelSheet } from './cancel-sheet';
import {
  CustomerSection,
  DeliverySection,
  NoteSection,
  OrderSummary,
  PaymentSection,
  ShipmentsSection,
  TimelineSection,
} from './order-sections';
import { useOrderWords } from './order-words';
import { ShipSheet } from './ship-sheet';
import { useOnline } from './use-online';
import { useOrderSteps, type StepOutcome } from './use-order-steps';
import { useOrder } from './use-orders';

/** The workflow's steps, in the order they come; cancel is apart. */
const WORKFLOW = ['mark_processing', 'mark_shipped', 'mark_delivered'] as const;
type WorkflowStep = (typeof WORKFLOW)[number];

/** The sheet open over the page: tracking, or cancelling. */
type OpenSheet = null | 'ship' | 'cancel';

/**
 * One order: its shipments (a seller sees their own), lines,
 * totals, payment, delivery, the customer's note and the timeline, and the
 * steps the store offers now (`actions`) as the operator's capabilities allow.
 * The next step of the workflow is in the action bar; cancelling is at the
 * end of the page and asks first.
 */
export function OrderScreen({ id }: { id: string }) {
  const t = useTranslations('orders.order');
  const fallback = useTranslations('shell.titles');
  const words = useOrderWords();
  const order = useOrder(id);
  const title = order.data
    ? t('title', { number: words.number(order.data.number) })
    : fallback('order');

  if (order.isPending) {
    return (
      <Screen header={<StackHeader title={title} />}>
        <LoadingState shape="rows" />
      </Screen>
    );
  }
  if (!order.data) {
    return (
      <Screen header={<StackHeader title={title} />}>
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      </Screen>
    );
  }
  return <OrderPage order={order.data} query={order} title={title} />;
}

type OrderPageProps = {
  order: OrderDetail;
  query: ReturnType<typeof useOrder>;
  title: string;
};

function OrderPage({ order, query, title }: OrderPageProps) {
  const t = useTranslations('orders');
  const words = useOrderWords();
  const steps = useOrderSteps(order);
  const online = useOnline();
  const canEdit = useCan('EDIT_ORDERS');
  const canCancel = useCan('CANCEL_ORDERS');
  const canReturns = useCan('VIEW_RETURNS');
  const canReturn = useCan('HANDLE_RETURNS');
  const canRefund = useCan('ISSUE_REFUNDS');
  // The customer's profile, when the store named them and the operator may see customers.
  const customerId = useCan('VIEW_ORDER_CUSTOMERS') ? order.customer.id : undefined;
  const workspace = useWorkspace();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  // What the cancel sheet calls off: one seller's part, or the whole order (`null`).
  // Kept after it closes, so its words stay put while it slides away.
  const [part, setPart] = useState<OrderConsignment | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh(query.refetch);

  const number = words.number(order.number);
  const busy = steps.sending !== null;
  const next = canEdit
    ? order.actions.find((action): action is WorkflowStep =>
        (WORKFLOW as readonly OrderAction[]).includes(action)
      )
    : undefined;
  const cancellable = canCancel && order.actions.includes('cancel');
  // The store's operators call off one seller's part of a split order; a
  // seller's own consignment is the order they see, cancelled from the page's end.
  const partsCancellable =
    canCancel && workspace.status === 'ready' && workspace.workspace === 'platform';
  const seller = part ? (part.vendorName ?? t('order.storeItems')) : undefined;
  const cancel = (consignment: OrderConsignment | null) => {
    setPart(consignment);
    setSheet('cancel');
  };

  const takeNext = (step: WorkflowStep) => {
    if (step === 'mark_shipped') {
      setSheet('ship');
      return;
    }
    void steps.take({ action: step }, t(`steps.done.${step}`, { number }));
  };

  // A sheet closes once the store has answered, unless it has a field to fix.
  // Offline, or with no answer, it stays with what was typed, to be sent again.
  const closeAfter = (outcome: StepOutcome) => {
    if (outcome.kind === 'done' || outcome.kind === 'refused') setSheet(null);
    return outcome;
  };

  return (
    <>
      <Screen
        header={<StackHeader title={title} />}
        scroll
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentClassName="gap-6 px-4 pt-2"
        footer={
          next ? (
            <ActionBar>
              <Button
                label={t(`steps.${next}`)}
                variant="accent"
                loading={steps.sending?.action === next && !steps.sending.consignmentId}
                disabled={busy}
                onPress={() => takeNext(next)}
              />
            </ActionBar>
          ) : undefined
        }>
        {steps.changed || !online || order.addressHold ? (
          <View className="gap-3">
            {steps.changed ? <Banner tone="warning" message={t('order.changed')} /> : null}
            {!online ? (
              <Banner tone="warning" icon="wifi-off" message={t('order.offline')} />
            ) : null}
            {order.addressHold ? (
              <Banner
                tone="warning"
                title={t('order.hold.title')}
                message={
                  order.addressHold.deadlineAt
                    ? `${t('order.hold.body')} ${t('order.hold.deadline', {
                        date: words.longDate(order.addressHold.deadlineAt),
                      })}`
                    : t('order.hold.body')
                }
              />
            ) : null}
          </View>
        ) : null}

        <OrderSummary order={order} />
        <CustomerSection
          customer={order.customer}
          onOpenProfile={
            customerId
              ? () => router.push({ pathname: '/customers/[id]', params: { id: customerId } })
              : undefined
          }
        />
        <ShipmentsSection
          order={order}
          onCancelPart={partsCancellable ? cancel : undefined}
          busy={busy}
        />
        <PaymentSection order={order} />
        <DeliverySection order={order} />
        {order.customerNote ? <NoteSection note={order.customerNote} /> : null}
        <TimelineSection events={order.timeline} />
        <RowGroup>
          {canReturns ? (
            <NavRow
              icon="return"
              title={t('order.viewReturns')}
              onPress={() =>
                router.push({ pathname: '/returns', params: { orderId: order.id, tab: 'all' } })
              }
            />
          ) : null}
          {canReturn ? (
            <NavRow
              icon="return"
              title={t('order.createReturn')}
              onPress={() =>
                router.push({ pathname: '/returns/new', params: { orderId: order.id } })
              }
            />
          ) : null}
          {canRefund ? (
            <NavRow
              icon="wallet"
              title={t('order.refund')}
              onPress={() =>
                router.push({
                  pathname: '/refunds/new',
                  params: { kind: 'order', targetId: order.id },
                })
              }
            />
          ) : null}
        </RowGroup>

        {cancellable ? (
          <RowGroup>
            <ActionRow
              icon="x-circle"
              destructive
              title={t('steps.cancel')}
              disabled={busy}
              onPress={() => cancel(null)}
            />
          </RowGroup>
        ) : null}
        {query.error ? (
          <InlineError error={query.error} onRetry={() => void query.refetch()} />
        ) : null}
      </Screen>

      <ShipSheet
        visible={sheet === 'ship'}
        sending={steps.sending?.action === 'mark_shipped'}
        onClose={() => setSheet(null)}
        onSubmit={async (tracking) =>
          closeAfter(
            await steps.take(
              { action: 'mark_shipped', ...tracking },
              t('steps.done.mark_shipped', { number })
            )
          )
        }
      />
      <CancelSheet
        visible={sheet === 'cancel'}
        number={number}
        part={seller}
        sending={steps.sending?.action === 'cancel'}
        onClose={() => setSheet(null)}
        onConfirm={async (reason) =>
          closeAfter(
            await steps.take(
              part
                ? { action: 'cancel', consignmentId: part.id, reason }
                : { action: 'cancel', reason },
              seller
                ? t('steps.done.cancelPart', { seller, number })
                : t('steps.done.cancel', { number })
            )
          )
        }
      />
    </>
  );
}

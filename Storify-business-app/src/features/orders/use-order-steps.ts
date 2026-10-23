import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { isFinal } from '@/api/attempt';
import { isApiError, isNetworkError } from '@/api/errors';
import { AlreadySending, AttemptAbandoned } from '@/api/keyed-mutation';
import { useToast } from '@/components/ui/toast';
import type { OrderActionRequest, OrderDetail } from '@/contracts/mobile/biz/v1';
import { useOpenDashboard } from '@/features/web/use-open-page';
import { useCan } from '@/features/workspace/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';

import { orderStateChanged, useOrderAction } from './use-orders';

/** The tracking fields the store said are missing (`TRACKING_REQUIRED`). */
export type TrackingFields = { carrier?: boolean; trackingNumber?: boolean };

/**
 * How a tap ended: the step was taken; the store refused it (the screen has
 * said why); nothing was sent, the phone being offline; no answer came back,
 * so the step may have been taken, and only the same step may go again (with
 * the tap's key, so the store takes it once); the same step was already on its
 * way (a double tap, ignored); or the "mark shipped" sheet has fields to fix.
 * A sheet stays open, with what was typed, unless the store answered.
 */
export type StepOutcome =
  | { kind: 'done' }
  | { kind: 'refused' }
  | { kind: 'notSent' }
  | { kind: 'unanswered' }
  | { kind: 'busy' }
  | { kind: 'fields'; fields: TrackingFields };

/**
 * The steps an order's page takes. Each tap goes
 * through `useOrderAction`: one `Idempotency-Key` per tap, the same for its
 * retries, so a step is made once however the answer travels. Afterwards the
 * page shows the order the store answered with, and a toast says what
 * happened; a refusal is said in the operator's words:
 *
 * - `ORDER_STATE_CHANGED`: the page now shows the order as somebody else left
 *   it, and a toast and a banner at the top say so (`changed`).
 * - `CANCEL_NEEDS_REFUND`: cancel on the website, where the refund is made;
 *   the toast opens it.
 * - `TRACKING_REQUIRED`: the sheet's fields.
 * - any other: its sentence (`errors.reason.*`), and the order is read again.
 * - offline: nothing was sent (`notSent`). No answer, or an answer that
 *   leaves the tap's key open (a 503 after every try, `REQUEST_IN_PROGRESS`,
 *   a 429): tap again, it is not made twice (`unanswered`), and the order is
 *   read again.
 */
export function useOrderSteps(order: OrderDetail) {
  const t = useTranslations('orders.steps');
  const common = useTranslations('common');
  const action = useOrderAction(order.id);
  const toast = useToast();
  const say = useErrorMessage();
  const openDashboard = useOpenDashboard();
  const canRefund = useCan('ISSUE_REFUNDS');
  const [changed, setChanged] = useState(false);

  const take = async (request: OrderActionRequest, done: string): Promise<StepOutcome> => {
    const online = onlineManager.isOnline();
    setChanged(false);
    try {
      await action.submit(request);
      toast.show({ message: done, tone: 'success' });
      return { kind: 'done' };
    } catch (error) {
      // A double tap: the first decides. A tap of the person who signed out: theirs.
      if (error instanceof AlreadySending || error instanceof AttemptAbandoned) {
        return { kind: 'busy' };
      }
      if (orderStateChanged(error)) {
        // The banner waits at the top; the toast reaches an operator scrolled down to the step.
        setChanged(true);
        toast.show({ message: say(error), tone: 'danger' });
        return { kind: 'refused' };
      }
      if (isApiError(error) && error.reason === 'TRACKING_REQUIRED') {
        return {
          kind: 'fields',
          fields: {
            carrier: Boolean(error.errors?.carrier),
            trackingNumber: Boolean(error.errors?.trackingNumber),
          },
        };
      }
      if (isNetworkError(error) && !online) {
        toast.show({ message: common('notSentOffline'), tone: 'offline' });
        return { kind: 'notSent' };
      }
      if (isNetworkError(error)) {
        toast.show({ message: t('noAnswer'), tone: 'danger' });
        return { kind: 'unanswered' };
      }
      // The store's fault after every try, "still running", or "too many, wait":
      // the tap's attempt stays open with its key, so the sheet keeps what was
      // typed and offers the same step again. (A 401 or 403 also keeps the key,
      // but says why the step is refused: the sheet closes on it, below.)
      if (isApiError(error) && !isFinal(error) && ![401, 403].includes(error.status)) {
        toast.show({
          message: error.status === 429 ? say(error) : t('noAnswer'),
          tone: 'danger',
        });
        return { kind: 'unanswered' };
      }
      if (
        isApiError(error) &&
        error.reason === 'CANCEL_NEEDS_REFUND' &&
        (canRefund || openDashboard)
      ) {
        toast.show({
          message: say(error),
          tone: 'danger',
          action: {
            label: canRefund ? t('reviewRefund') : common('openWebsite'),
            onPress: () =>
              canRefund
                ? router.push({
                    pathname: '/refunds/new',
                    params: { kind: 'order', targetId: order.id },
                  })
                : openDashboard?.(),
          },
        });
      } else {
        toast.show({ message: say(error), tone: 'danger' });
      }
      return { kind: 'refused' };
    }
  };

  return {
    take,
    /** The step on its way, if one is: its button spins and the others wait. */
    sending: action.isPending ? (action.variables ?? null) : null,
    /** Somebody else changed the order under the operator's last tap. */
    changed,
  };
}

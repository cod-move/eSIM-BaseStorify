import * as Crypto from 'expo-crypto';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { ApiError, isApiError } from '@/api/errors';
import { AlreadySending } from '@/api/keyed-mutation';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/ui/form-sections';
import { ActionBar, Screen, StackHeader } from '@/components/ui/screen';
import { ConfirmSheet } from '@/components/ui/sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  ManualOrderDraftRequest,
  ManualOrderCreateRequest,
  OrderContactCreateRequest,
  type ManualOrderFormOptions,
  type ManualOrderCreateResult,
  type OrderContactCreateResult,
} from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';
import {
  CreationNotRecorded,
  CreationScopeChanged,
  CreationUnconfirmed,
  useCreateManualOrder,
  useCreateOrderContact,
  useOrderCreationOptions,
  useOrderQuote,
} from './use-order-creation';
import {
  creationDraftKey,
  creationFingerprint,
  getCreationDraft,
  removeCreationDraft,
  setCreationDraft,
  type CreationDraft,
} from './creation/draft';
import { addressLines, useCreationErrorMessage } from './creation/controls';
import { CreationCustomer } from './creation/customer-section';
import { CreationDelivery } from './creation/delivery-section';
import { CreationItems } from './creation/items-section';
import { CreationPayment } from './creation/payment-section';
import { CreationReview } from './creation/review';

type Section = 'items' | 'customer' | 'delivery' | 'payment';
/** Where each field of the draft is written, so a refused one marks its card. */
const FIELD_SECTIONS: Record<string, Section> = {
  items: 'items',
  locationId: 'items',
  customer: 'customer',
  deliveryId: 'delivery',
  shippingAddress: 'delivery',
  billingAddress: 'delivery',
  paymentMethod: 'payment',
  shippingCost: 'payment',
  discount: 'payment',
  taxRate: 'payment',
  notes: 'payment',
};
const SECTION_ICONS = {
  items: 'package',
  customer: 'user',
  delivery: 'truck',
  payment: 'wallet',
} as const;
/**
 * Where a new draft's stock comes from: the operator's one location, else the
 * store's own allocation. Choosing a location ties every item to its stock.
 */
const startingLocation = (options: ManualOrderFormOptions) =>
  options.locations.length === 1 ? options.locations[0]!.id : undefined;
export function OrderCreationScreen() {
  const t = useTranslations('orders.create');
  const options = useOrderCreationOptions();
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const can = useCan('CREATE_ORDERS');
  const header = <StackHeader title={t('title')} />;
  if (!can || !scope || !user)
    return (
      <Screen header={header}>
        <EmptyState title={t('noAccess')} />
      </Screen>
    );
  if (!options.data)
    return (
      <Screen header={header}>
        {options.isError ? (
          <ErrorState error={options.error} onRetry={() => void options.refetch()} />
        ) : (
          <LoadingState shape="rows" />
        )}
      </Screen>
    );
  const key = creationDraftKey(user.id, scope.workspace);
  return (
    <CreationForm key={key} draftKey={key} workspace={scope.workspace} options={options.data} />
  );
}
function CreationForm({
  draftKey,
  workspace,
  options,
}: {
  draftKey: string;
  workspace: NonNullable<ReturnType<typeof useWorkspaceScope>>['workspace'];
  options: ManualOrderFormOptions;
}) {
  const t = useTranslations('orders.create');
  const describe = useCreationErrorMessage();
  const toast = useToast();
  const navigation = useNavigation();
  const scope = useWorkspaceScope();
  const can = useCan('CREATE_ORDERS');
  const canViewOrders = useCan('VIEW_ORDERS');
  const canRecord = useCan('RECORD_ORDER_PAYMENTS');
  const canContact = useCan('CREATE_ORDER_CONTACTS');
  const [draft, setDraft] = useState<CreationDraft>(
    () =>
      getCreationDraft(draftKey) ?? {
        workspace,
        reviewing: false,
        products: [],
        form: {
          draftId: Crypto.randomUUID(),
          items: [],
          locationId: startingLocation(options),
          deliveryId: options.delivery[0]?.id,
          paymentMethod: options.payments[0]?.id,
        },
        customerMode: options.customerModes[0] ?? 'guest',
        contact: { name: '', email: '', phone: '' },
        recordPayment: false,
        paymentReference: '',
        billingSeparate: false,
      }
  );
  const create = useCreateManualOrder(draft.form.draftId);
  const contact = useCreateOrderContact(draft.form.draftId);
  const quote = useOrderQuote();
  const [error, setError] = useState<unknown>(null);
  const [validation, setValidation] = useState<ReadonlySet<Section>>(new Set());
  const [confirm, setConfirm] = useState(false);
  const [leave, setLeave] = useState<NavigationAction | 'header' | null>(null);
  const [allowLeave, setAllowLeave] = useState(false);
  const departure = useRef<(() => void) | null>(null);
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);
  const [now, setNow] = useState(() => Date.now());
  const [previousRecordGrant, setPreviousRecordGrant] = useState(canRecord);
  if (previousRecordGrant !== canRecord) {
    setPreviousRecordGrant(canRecord);
    if (!canRecord && draft.recordPayment && !draft.operation)
      setDraft((previous) => ({ ...previous, recordPayment: false, paymentReference: '' }));
  }
  const busy = quote.isPending || create.isPending || contact.isPending;
  const locked = busy || Boolean(draft.operation) || !can || scope?.workspace !== workspace;
  const dirty =
    draft.customerMode !== (options.customerModes[0] ?? 'guest') ||
    creationFingerprint({ ...draft.form, draftId: undefined }) !==
      creationFingerprint({
        items: [],
        locationId: startingLocation(options),
        deliveryId: options.delivery[0]?.id,
        paymentMethod: options.payments[0]?.id,
      }) ||
    draft.form.items.length > 0 ||
    Boolean(draft.form.customer) ||
    Boolean(draft.contact.name || draft.contact.email || draft.form.notes) ||
    Boolean(draft.operation);
  const expired =
    !draft.quote ||
    draft.quoteValidUntil === undefined ||
    draft.quoteValidUntil <= now ||
    draft.quotedFingerprint !== creationFingerprint(draft.form);
  useEffect(() => {
    if (dirty && !allowLeave) setCreationDraft(draftKey, draft);
    else removeCreationDraft(draftKey);
  }, [draft, dirty, draftKey, allowLeave]);
  useEffect(() => {
    if (!draft.quote) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [draft.quote]);
  useEffect(() => {
    if (allowLeave && departure.current) {
      const go = departure.current;
      departure.current = null;
      go();
    }
  }, [allowLeave]);
  usePreventRemove(
    can && scope?.workspace === workspace && !allowLeave && (dirty || busy),
    ({ data }) => setLeave(data.action)
  );
  const change = (changes: Partial<CreationDraft>) => {
    if (locked) return;
    const affectsQuote = changes.form !== undefined || changes.customerMode !== undefined;
    setDraft((previous) => ({
      ...previous,
      ...changes,
      ...(affectsQuote
        ? { quote: undefined, quotedFingerprint: undefined, recordPayment: false }
        : {}),
    }));
    setError(null);
    setValidation(new Set());
  };
  const exit = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/orders');
  };
  /** The store made the order; without `order` when this operator may not read it. */
  const completed = (order?: ManualOrderCreateResult['order']) => {
    removeCreationDraft(draftKey);
    setDraft((previous) => ({ ...previous, operation: undefined }));
    departure.current = () =>
      canViewOrders && order
        ? router.replace({ pathname: '/orders/[id]', params: { id: order.id } })
        : router.replace(canViewOrders ? '/(tabs)/orders' : '/(tabs)');
    setAllowLeave(true);
    toast.show({
      message: order ? t('created', { number: order.number }) : t('createdConfirmed'),
      tone: 'success',
    });
  };
  /**
   * The store made the contact. Without its record (this operator may not read
   * customers), the order goes to the guest it was made from.
   */
  const contactCreated = (
    customer: OrderContactCreateResult['customer'] | undefined,
    request: OrderContactCreateRequest
  ) => {
    const existing = Boolean(customer) && options.customerModes.includes('existing');
    setDraft((previous) => ({
      ...previous,
      operation: undefined,
      selectedCustomer: customer,
      customerMode: existing ? 'existing' : 'guest',
      quote: undefined,
      quotedFingerprint: undefined,
      form: {
        ...previous.form,
        customer:
          existing && customer
            ? { kind: 'existing', id: customer.id }
            : {
                kind: 'guest',
                name: customer?.name ?? request.name,
                email: customer?.email ?? request.email,
                phone: customer ? customer.phone : request.phone,
              },
      },
    }));
    toast.show({ message: t('contactCreated'), tone: 'success' });
  };
  const fail = (
    failure: unknown,
    kind?: 'order' | 'contact',
    request?: ManualOrderCreateRequest | OrderContactCreateRequest
  ) => {
    if (failure instanceof CreationScopeChanged || failure instanceof AlreadySending) return;
    const writer = kind === 'order' ? create : contact;
    const original = writer.original();
    const key = failure instanceof CreationUnconfirmed ? failure.key : original?.key;
    // Held only while the store may have made the change: the draft waits for
    // a check of the original. A refusal of a write that never went unanswered
    // (a 403 or 422 naming no operation, a 429 before the key) is the store's
    // definite answer: nothing was made, and the draft stays free.
    const open =
      kind && key && request && (failure instanceof CreationUnconfirmed || writer.unsettled());
    if (open) {
      const sent = original?.key === key ? original.request : request;
      setDraft((previous) => ({
        ...previous,
        operation:
          kind === 'order'
            ? { kind, key, request: sent as ManualOrderCreateRequest }
            : { kind, key, request: sent as OrderContactCreateRequest },
      }));
    }
    if (
      isApiError(failure) &&
      ((kind === 'order' && !open) ||
        ['QUOTE_CHANGED', 'QUOTE_EXPIRED'].includes(failure.reason ?? ''))
    ) {
      // The store bound the quote to the refused creation, so the next one
      // needs a new quote. The old one stays on show, marked out of date,
      // beside the way to a new one.
      setDraft((previous) => ({
        ...previous,
        quotedFingerprint: undefined,
        recordPayment: false,
      }));
      setConfirm(false);
    }
    setError(failure);
  };
  const review = async () => {
    if (locked) return;
    const parsed = ManualOrderDraftRequest.safeParse(draft.form);
    if (!parsed.success) {
      setValidation(
        new Set(
          parsed.error.issues.map((issue) => FIELD_SECTIONS[String(issue.path[0])] ?? 'items')
        )
      );
      return;
    }
    setValidation(new Set());
    setError(null);
    const fingerprint = creationFingerprint(draft.form);
    // The quote's life starts no earlier than the question: counted from here
    // on the phone's own clock, it never outlasts the store's.
    const asked = Date.now();
    try {
      const result = await quote.mutateAsync(parsed.data);
      if (creationFingerprint(latest.current.form) !== fingerprint) return;
      setNow(Date.now());
      setDraft((previous) => ({
        ...previous,
        quote: result,
        quoteValidUntil: asked + options.limits.quoteLifetimeSeconds * 1000,
        quotedFingerprint: fingerprint,
        reviewing: true,
        recordPayment: false,
      }));
    } catch (failure) {
      fail(failure);
    }
  };
  const submit = async () => {
    if (locked) return;
    if (
      expired ||
      !draft.quote ||
      draft.quoteValidUntil === undefined ||
      draft.quoteValidUntil <= Date.now()
    ) {
      setConfirm(false);
      setError(new ApiError(409, 'CONFLICT', '', { reason: 'QUOTE_EXPIRED' }));
      return;
    }
    if (draft.recordPayment && (!canRecord || !draft.quote.payment.canRecordPayment)) {
      setError(
        new ApiError(403, 'AUTHORIZATION_ERROR', '', { reason: 'PAYMENT_RECORDING_NOT_ALLOWED' })
      );
      return;
    }
    const parsed = ManualOrderCreateRequest.safeParse({
      draft: draft.form,
      quoteToken: draft.quote.token,
      ...(draft.recordPayment
        ? { recordPayment: { reference: draft.paymentReference.trim() || undefined } }
        : {}),
    });
    if (!parsed.success) {
      setConfirm(false);
      setDraft((previous) => ({ ...previous, reviewing: false }));
      return;
    }
    try {
      const result = await create.submit(parsed.data);
      setConfirm(false);
      completed(result.order);
    } catch (failure) {
      setConfirm(false);
      fail(failure, 'order', parsed.data);
    }
  };
  const createContact = async () => {
    if (locked || !canContact) return;
    const parsed = OrderContactCreateRequest.safeParse(draft.contact);
    if (!parsed.success) {
      setValidation(new Set(['customer']));
      return;
    }
    try {
      contactCreated((await contact.submit(parsed.data)).customer, parsed.data);
    } catch (failure) {
      fail(failure, 'contact', parsed.data);
    }
  };
  const recover = async () => {
    const held = draft.operation;
    if (!held || busy) return;
    setError(null);
    try {
      const { operation, result } =
        held.kind === 'order'
          ? await create.recover(held.key, held.request)
          : await contact.recover(held.key, held.request);
      if (!operation) {
        // The store never received it: nothing was made. The quote stays, if
        // still valid, for the same creation to be sent again.
        setDraft((previous) => ({ ...previous, operation: undefined }));
        setError(new CreationNotRecorded());
      } else if (operation.state === 'succeeded') {
        if (held.kind === 'order')
          completed(result && 'order' in result ? result.order : undefined);
        else
          contactCreated(
            result && 'customer' in result ? result.customer : undefined,
            held.request
          );
      } else if (operation.state === 'failed') {
        setDraft((previous) => ({
          ...previous,
          operation: undefined,
          quote: undefined,
          quotedFingerprint: undefined,
          recordPayment: false,
        }));
        setError(
          new ApiError(409, 'CONFLICT', '', {
            reason: operation.reason ?? 'OPERATION_FAILED',
          })
        );
      } else setError(new CreationUnconfirmed(held.key, operation));
    } catch (failure) {
      fail(failure);
    }
  };
  const delivery = options.delivery.find((item) => item.id === draft.form.deliveryId);
  const paymentLabel = (id?: string) => {
    const method = options.payments.find((item) => item.id === id);
    if (!method) return t('notChosen');
    return t.has(`payments.${method.id}` as never)
      ? t(`payments.${method.id}` as never)
      : method.label;
  };
  const units = draft.form.items.reduce(
    (total, item) => total + (Number.isFinite(item.quantity) ? item.quantity : 0),
    0
  );
  const customerName =
    draft.customerMode === 'existing'
      ? draft.selectedCustomer?.name
      : draft.customerMode === 'create_contact'
        ? draft.contact.name
        : draft.form.customer?.kind === 'guest'
          ? draft.form.customer.name
          : undefined;
  const summaries: Record<Section, string> = {
    items: draft.form.items.length
      ? t('itemsSummary', { lines: draft.form.items.length, units })
      : t('noItems'),
    customer: customerName?.trim() || t('notChosen'),
    delivery: [
      delivery
        ? delivery.kind === 'shipping'
          ? t('shipping')
          : t('pickupAt', { name: delivery.label })
        : t('notChosen'),
      delivery?.addressRequired && draft.form.shippingAddress
        ? addressLines(draft.form.shippingAddress, options.countries)[1]
        : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
    payment: paymentLabel(draft.form.paymentMethod),
  };
  const section = (key: Section) => ({
    id: key,
    icon: SECTION_ICONS[key],
    title: t(`sections.${key}`),
    invalid: validation.has(key),
    summary: validation.has(key) ? t('needsAttention') : summaries[key],
  });
  const edit = () => {
    setConfirm(false);
    setDraft((previous) => ({ ...previous, reviewing: false }));
  };
  const reviewing = draft.reviewing && Boolean(draft.quote);
  return (
    <Screen
      scroll
      contentClassName="gap-3 px-4 pt-2 pb-6"
      header={
        <StackHeader
          title={t(reviewing ? 'reviewTitle' : 'title')}
          onBack={() =>
            reviewing && !busy && !draft.operation
              ? edit()
              : dirty || busy
                ? setLeave('header')
                : exit()
          }
        />
      }
      footer={
        <ActionBar>
          {!reviewing && validation.size ? (
            <Text variant="caption" className="text-center text-danger" accessibilityRole="alert">
              {t('validation')}
            </Text>
          ) : null}
          {!reviewing ? (
            <Button
              label={t('reviewQuote')}
              variant="accent"
              loading={quote.isPending}
              disabled={locked}
              onPress={() => void review()}
            />
          ) : expired ? (
            <Button
              label={t('refreshQuote')}
              variant="accent"
              loading={quote.isPending}
              disabled={locked}
              onPress={() => void review()}
            />
          ) : (
            <View className="flex-row gap-3">
              <Button
                label={t('edit')}
                variant="secondary"
                className="flex-1"
                disabled={locked}
                onPress={edit}
              />
              <Button
                label={t('createOrder')}
                variant="accent"
                className="flex-1"
                disabled={locked}
                onPress={() => setConfirm(true)}
              />
            </View>
          )}
        </ActionBar>
      }>
      {error ? (
        <Banner
          tone={error instanceof CreationNotRecorded ? 'warning' : 'danger'}
          message={
            error instanceof CreationUnconfirmed
              ? t('unconfirmed')
              : error instanceof CreationNotRecorded
                ? t('notCreated')
                : describe(error)
          }
        />
      ) : null}
      {draft.operation ? (
        <View className="gap-3 rounded-xl bg-surface p-4">
          <Banner tone="warning" message={t('unconfirmed')} />
          <Button
            label={t('checkCreation')}
            variant="primary"
            loading={busy}
            onPress={() => void recover()}
          />
        </View>
      ) : null}
      {reviewing ? (
        <CreationReview
          draft={draft}
          options={options}
          onChange={change}
          onEdit={edit}
          disabled={locked}
          expired={expired}
        />
      ) : (
        <>
          <FormSection {...section('items')}>
            <CreationItems draft={draft} options={options} onChange={change} disabled={locked} />
          </FormSection>
          <FormSection {...section('customer')}>
            <CreationCustomer
              draft={draft}
              options={options}
              onChange={change}
              disabled={locked}
              creating={contact.isPending}
              onCreateContact={() => void createContact()}
            />
          </FormSection>
          <FormSection {...section('delivery')}>
            <CreationDelivery draft={draft} options={options} onChange={change} disabled={locked} />
          </FormSection>
          <FormSection {...section('payment')}>
            <CreationPayment draft={draft} options={options} onChange={change} disabled={locked} />
          </FormSection>
        </>
      )}
      <ConfirmSheet
        visible={confirm}
        title={t('confirmTitle')}
        body={t(draft.recordPayment ? 'confirmPaid' : 'confirmBody', {
          total: draft.quote?.totals.total.formatted ?? '',
        })}
        confirmLabel={t('confirmCreate')}
        cancelLabel={t('keepReviewing')}
        loading={create.isPending}
        confirmDisabled={expired || locked}
        onConfirm={() => void submit()}
        onCancel={() => {
          if (!busy) setConfirm(false);
        }}
      />
      <ConfirmSheet
        visible={Boolean(leave)}
        title={t('discardTitle')}
        body={draft.operation || busy ? t('cannotDiscard') : t('discardBody')}
        tone="danger"
        confirmLabel={t('discard')}
        cancelLabel={t('keepEditing')}
        confirmDisabled={busy || Boolean(draft.operation)}
        onCancel={() => setLeave(null)}
        onConfirm={() => {
          if (busy || draft.operation) return;
          removeCreationDraft(draftKey);
          departure.current = () =>
            leave === 'header' ? exit() : leave && navigation.dispatch(leave);
          setAllowLeave(true);
          setLeave(null);
        }}
      />
    </Screen>
  );
}

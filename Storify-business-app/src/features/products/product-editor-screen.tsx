import * as Crypto from 'expo-crypto';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isFinal } from '@/api/attempt';
import { isApiError } from '@/api/errors';
import { AlreadySending } from '@/api/keyed-mutation';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import type { IconName } from '@/components/ui/icon';
import { ActionRow, RowGroup, SectionLabel, ValueRow } from '@/components/ui/rows';
import { ActionBar, Screen, StackHeader } from '@/components/ui/screen';
import { ConfirmSheet } from '@/components/ui/sheet';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import {
  ProductCreateRequest,
  ProductSaveRequest,
  ProductEditorDetail,
  type ProductEditorActionRequest,
  type ProductEditorFields,
  type ProductEditorResult,
  type ProductFormOptions,
} from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useCan, useWorkspaceScope } from '@/features/workspace/use-workspace';
import { useErrorMessage } from '@/i18n/use-error-message';

import {
  AvailabilitySection,
  DetailsSection,
  InventorySection,
  PreorderSection,
  PricingSection,
  SeoSection,
  ShippingSection,
} from './editor/business-sections';
import { EditorValidationContext } from './editor/controls';
import {
  getProductDraft,
  productDraftKey,
  removeProductDraft,
  setProductDraft,
  type ProductDraft,
} from './editor/drafts';
import { createProductValues, fullProductChanges, newProductValues } from './editor/form';
import { FormSection } from '@/components/ui/form-sections';
import { MediaSection } from './editor/media-section';
import { fieldSection, useSectionSummaries, type EditorSectionKey } from './editor/summaries';
import { VariantsSection } from './editor/variants-section';
import type { ProductEditorSectionProps } from './editor/types';
import {
  ProductEditorConflict,
  ProductEditorScopeChanged,
  ProductEditorNotReceived,
  ProductEditorUnconfirmed,
  useCreateFullProduct,
  useFullProductAction,
  useProductEditor,
  useProductFormOptions,
  useSaveFullProduct,
} from './use-product-editor';
import { editorFingerprint, storeValuesInConflict } from './product-editor-conflict';

const SECTION_ICONS: Record<EditorSectionKey, IconName> = {
  details: 'file-text',
  media: 'image',
  variants: 'layers',
  pricing: 'tag',
  inventory: 'boxes',
  shipping: 'truck',
  availability: 'store',
  preorder: 'calendar',
  seo: 'search',
};

export function ProductEditorScreen({ id = null }: { id?: string | null }) {
  const t = useTranslations('products.editor');
  const options = useProductFormOptions(id);
  const editor = useProductEditor(id);
  const scope = useWorkspaceScope();
  const { user } = useSession();
  const canWrite = useCan(id ? 'EDIT_PRODUCTS' : 'CREATE_PRODUCTS');
  const key = scope && user ? productDraftKey(user.id, scope.workspace, id) : null;
  const header = <StackHeader title={t(id ? 'editTitle' : 'createTitle')} />;
  if (!canWrite || !key || !scope)
    return (
      <Screen header={header}>
        <EmptyState title={t('noAccess')} />
      </Screen>
    );
  if (!options.data || (id && !editor.data))
    return (
      <Screen header={header}>
        {options.isError || editor.isError ? (
          <ErrorState
            error={options.error ?? editor.error}
            onRetry={() => {
              void options.refetch();
              if (id) void editor.refetch();
            }}
          />
        ) : (
          <LoadingState shape="rows" />
        )}
      </Screen>
    );
  return (
    <EditorForm
      key={key}
      id={id}
      draftKey={key}
      workspace={scope.workspace}
      options={options.data}
      initial={editor.data}
    />
  );
}

/** The fields a request refuses, by their top-level name: `name`, `variants`. */
function refusedFields(issues: readonly { path: readonly PropertyKey[] }[]) {
  return [
    ...new Set(
      issues.map((issue) =>
        String(
          issue.path[issue.path[0] === 'values' || issue.path[0] === 'changes' ? 1 : 0] ?? 'values'
        )
      )
    ),
  ];
}

function EditorForm({
  id,
  draftKey,
  workspace,
  options,
  initial,
}: {
  id: string | null;
  draftKey: string;
  workspace: string;
  options: ProductFormOptions;
  initial?: ProductEditorDetail;
}) {
  const t = useTranslations('products.editor');
  const describe = useErrorMessage();
  const toast = useToast();
  const navigation = useNavigation();
  const create = useCreateFullProduct();
  const save = useSaveFullProduct(id ?? '');
  const action = useFullProductAction(id ?? '');
  const [draft, setDraft] = useState<ProductDraft>(
    () =>
      getProductDraft(draftKey) ?? {
        workspace,
        draftId: Crypto.randomUUID(),
        values: initial?.values ?? newProductValues(options),
        base: initial,
      }
  );
  const [open, setOpen] = useState<ReadonlySet<EditorSectionKey>>(() => new Set(['details']));
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [validation, setValidation] = useState<string[]>([]);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const [pendingUpload, setPendingUpload] = useState(false);
  const [conflict, setConflict] = useState<ProductEditorConflict | null>(null);
  const [pendingAction, setPendingAction] = useState<ProductEditorActionRequest['action'] | null>(
    null
  );
  const [leave, setLeave] = useState<NavigationAction | null>(null);
  const [allowLeave, setAllowLeave] = useState(false);
  const departure = useRef<(() => void) | null>(null);
  const [headerLeave, setHeaderLeave] = useState(false);
  const canDelete = useCan('DELETE_PRODUCTS');
  const canWrite = useCan(id ? 'EDIT_PRODUCTS' : 'CREATE_PRODUCTS');
  const scope = useWorkspaceScope();
  const writable = useMemo(
    () =>
      options.writableFields.filter(
        (key) => !draft.base || draft.base.writableFields.includes(key)
      ),
    [options.writableFields, draft.base]
  );
  const changes = draft.base ? fullProductChanges(draft.base, draft.values, writable) : null;
  const changed = changes ? Object.keys(changes.changes) : [];
  const dirty = draft.base
    ? changed.length > 0
    : editorFingerprint(draft.values) !== editorFingerprint(newProductValues(options));
  const busy =
    create.isPending ||
    save.isPending ||
    action.isPending ||
    create.isRecovering ||
    save.isRecovering ||
    action.isRecovering;
  const locked = busy || Boolean(draft.operation) || !canWrite || scope?.workspace !== workspace;
  const summaries = useSectionSummaries(draft.values, options, id === null);
  const issues = useMemo(() => new Set(validation), [validation]);
  // A section is marked when a field in it was refused, or holds a number it cannot take.
  const flagged = new Map<EditorSectionKey, string[]>();
  for (const field of validation) {
    const section = fieldSection(field);
    if (section) flagged.set(section, [...(flagged.get(section) ?? []), field]);
  }
  for (const key of invalid) {
    const section = key.split('|')[0] as EditorSectionKey;
    if (section && !flagged.has(section)) flagged.set(section, []);
  }
  const fieldName = (field: string) =>
    field !== 'values' && t.has(field as never) && typeof t.raw(field as never) === 'string'
      ? t(field as never)
      : t('values');
  const registerInvalid = useCallback(
    (key: string, blocked: boolean) =>
      setInvalid((previous) => {
        if (previous.has(key) === blocked) return previous;
        const next = new Set(previous);
        if (blocked) next.add(key);
        else next.delete(key);
        return next;
      }),
    []
  );
  useEffect(() => {
    if (dirty || draft.operation) setProductDraft(draftKey, draft);
    else removeProductDraft(draftKey);
  }, [draft, draftKey, dirty]);
  // A change or an upload on its way holds the screen until it has its answer. A
  // change without a confirmed outcome does not: its draft (and the change's key)
  // is kept, and the editor opens on it again, to send it again or check it.
  const sending = busy || pendingUpload;
  usePreventRemove(
    canWrite &&
      scope?.workspace === workspace &&
      !allowLeave &&
      (sending || (dirty && !draft.operation)),
    ({ data }) => {
      if (!sending) setLeave(data.action);
    }
  );
  useEffect(() => {
    if (allowLeave && departure.current) {
      const go = departure.current;
      departure.current = null;
      go();
    }
  }, [allowLeave]);
  const onChange = (next: Partial<ProductEditorFields>) => {
    if (locked) return;
    setDraft((previous) => ({ ...previous, values: { ...previous.values, ...next } }));
    setError(null);
    setValidation((previous) =>
      previous.length ? previous.filter((field) => !(field in next)) : previous
    );
  };
  /** Shows what to correct: the refused fields' sections open, marked. */
  const refuse = (fields: string[]) => {
    setValidation(fields);
    setOpen((previous) => {
      const next = new Set(previous);
      for (const field of fields) {
        const section = fieldSection(field);
        if (section) next.add(section);
      }
      return next;
    });
  };
  /** The change the draft waits on, with the action it was (to know a deletion when it is checked). */
  const operationOf = (key: string, kind: 'create' | 'save' | 'action') => {
    const performed = pendingAction ?? draft.operation?.action;
    return { key, kind, ...(kind === 'action' && performed ? { action: performed } : {}) };
  };
  const accept = (result: ProductEditorResult, kind: 'create' | 'save' | 'action') => {
    setReviewing(false);
    if (result.deleted && result.operation.state === 'succeeded') {
      removeProductDraft(draftKey);
      departure.current = () => router.replace('/(tabs)/products');
      setAllowLeave(true);
      toast.show({ message: t('deleted'), tone: 'success' });
      return;
    }
    if (
      result.product &&
      (result.operation.state === 'succeeded' || result.operation.state === 'failed')
    ) {
      removeProductDraft(draftKey);
      setDraft((previous) => ({
        ...previous,
        values: result.product!.values,
        base: result.product,
        operation: undefined,
      }));
      toast.show({ message: t(kind === 'create' ? 'created' : 'saved'), tone: 'success' });
      // A new product's page takes the editor's place; an edit returns to the page it came from.
      departure.current = () => {
        if (kind !== 'create' && router.canGoBack()) router.back();
        else router.replace({ pathname: '/products/[id]', params: { id: result.product!.id } });
      };
      setAllowLeave(true);
      return;
    }
    if (result.operation.state === 'failed') {
      setDraft((previous) => ({ ...previous, operation: undefined }));
      setError(new ProductEditorUnconfirmed(result.operation.key, result.operation));
      return;
    }
    const operation = operationOf(result.operation.key, kind);
    setDraft((previous) => ({ ...previous, operation }));
    setError(new ProductEditorUnconfirmed(result.operation.key, result.operation));
  };
  const failure = (
    caught: unknown,
    kind: 'create' | 'save' | 'action',
    writer: typeof create | typeof save | typeof action
  ) => {
    setReviewing(false);
    if (caught instanceof ProductEditorScopeChanged || caught instanceof AlreadySending) return;
    // The store answered for the change's key: whatever it waited on is over.
    if (caught instanceof ProductEditorConflict || isFinal(caught))
      setDraft((previous) => ({ ...previous, operation: undefined }));
    if (caught instanceof ProductEditorConflict) {
      setConflict(caught);
      setError(null);
      return;
    }
    if (kind === 'action' && isApiError(caught) && caught.status === 412) {
      const current = ProductEditorDetail.safeParse(caught.details?.product);
      if (current.success)
        setDraft((previous) => ({ ...previous, base: current.data, values: current.data.values }));
    }
    const unanswered =
      caught instanceof ProductEditorUnconfirmed
        ? caught.key
        : !isFinal(caught)
          ? writer.original()?.key
          : undefined;
    if (unanswered) {
      const operation = operationOf(unanswered, kind);
      setDraft((previous) => ({ ...previous, operation }));
    }
    if (isApiError(caught) && caught.errors)
      refuse(Object.keys(caught.errors).map((key) => key.split('.')[0] ?? key));
    setError(caught);
  };
  const request = () =>
    id && draft.base
      ? ProductSaveRequest.safeParse(fullProductChanges(draft.base, draft.values, writable))
      : ProductCreateRequest.safeParse({
          draftId: draft.draftId,
          values: createProductValues(draft.values, writable),
        });
  /** Checks the draft as the contract does; true when it may be sent. */
  function check() {
    const parsed = request();
    if (parsed.success && !invalid.size) return true;
    refuse(parsed.success ? ['numbers'] : refusedFields(parsed.error.issues));
    if (!parsed.success) return false;
    setOpen((previous) => {
      const next = new Set(previous);
      for (const key of invalid) next.add(key.split('|')[0] as EditorSectionKey);
      return next;
    });
    return false;
  }
  async function submit() {
    if (locked || pendingUpload) return;
    const parsed = request();
    if (!parsed.success || invalid.size) {
      setReviewing(false);
      check();
      return;
    }
    setError(null);
    setValidation([]);
    if (id && draft.base) {
      try {
        accept(
          await save.submit({ request: ProductSaveRequest.parse(parsed.data), base: draft.base }),
          'save'
        );
      } catch (caught) {
        failure(caught, 'save', save);
      }
    } else {
      try {
        accept(await create.submit(ProductCreateRequest.parse(parsed.data)), 'create');
      } catch (caught) {
        failure(caught, 'create', create);
      }
    }
  }
  async function recover() {
    if (!draft.operation) return;
    const { key, kind } = draft.operation;
    const writer = kind === 'create' ? create : kind === 'save' ? save : action;
    setError(null);
    try {
      accept(
        await writer.recover(
          key,
          draft.operation.action ? { action: draft.operation.action } : undefined
        ),
        kind
      );
    } catch (caught) {
      // The store never received it: the draft is free again, to review and send.
      if (caught instanceof ProductEditorNotReceived)
        setDraft((previous) => ({ ...previous, operation: undefined }));
      setError(caught);
    }
  }
  /** Sends the unconfirmed change again as it went (same key, same body): what settles it on the store. */
  async function resend() {
    if (!draft.operation || busy) return;
    const { key, kind } = draft.operation;
    const writer = kind === 'create' ? create : kind === 'save' ? save : action;
    setError(null);
    try {
      accept(await writer.resend(key), kind);
    } catch (caught) {
      // This phone no longer holds what went under the key: the store's record is all there is.
      if (caught instanceof ProductEditorScopeChanged && !writer.original()) return recover();
      failure(caught, kind, writer);
    }
  }
  async function performAction() {
    if (!pendingAction || !draft.base || locked || pendingUpload || dirty) return;
    setError(null);
    try {
      accept(
        await action.submit({ action: { action: pendingAction }, version: draft.base.version }),
        'action'
      );
      setPendingAction(null);
    } catch (caught) {
      failure(caught, 'action', action);
      setPendingAction(null);
    }
  }
  const props: ProductEditorSectionProps = {
    values: draft.values,
    saved: draft.base?.values,
    options,
    writableFields: writable,
    onChange,
    draftId: draft.draftId,
    productId: id,
    disabled: locked,
    isNew: id === null,
    issues,
    onPendingUploadChange: setPendingUpload,
  };
  const sections: { key: EditorSectionKey; content: ReactNode }[] = [
    { key: 'details', content: <DetailsSection {...props} /> },
    { key: 'media', content: <MediaSection {...props} /> },
    { key: 'variants', content: <VariantsSection {...props} /> },
    { key: 'pricing', content: <PricingSection {...props} /> },
    { key: 'inventory', content: <InventorySection {...props} /> },
    ...(writable.includes('shipping')
      ? [{ key: 'shipping' as const, content: <ShippingSection {...props} /> }]
      : []),
    { key: 'availability', content: <AvailabilitySection {...props} /> },
    ...(options.features.preorders && writable.includes('preorder')
      ? [{ key: 'preorder' as const, content: <PreorderSection {...props} /> }]
      : []),
    ...(writable.includes('seo')
      ? [{ key: 'seo' as const, content: <SeoSection {...props} /> }]
      : []),
  ];
  const flaggedCount = validation.filter((field) => field !== 'numbers').length + invalid.size;
  // Said again whenever the editor opens on a change still waiting for its outcome.
  const unconfirmed =
    error instanceof ProductEditorUnconfirmed
      ? error
      : draft.operation
        ? new ProductEditorUnconfirmed(draft.operation.key)
        : null;
  const category = options.categories.find((item) => item.id === draft.values.category);
  const changedSections = [
    ...new Set(changed.map(fieldSection).filter((section) => section !== undefined)),
  ];
  const offered =
    id && draft.base
      ? draft.base.actions.filter(
          (item) => (item !== 'delete' || canDelete) && item.slice(4) !== draft.base?.values.status
        )
      : [];
  return (
    <EditorValidationContext value={registerInvalid}>
      <Screen
        header={
          <StackHeader
            title={t(id ? 'editTitle' : 'createTitle')}
            onBack={() => {
              if (sending) return;
              if (dirty && !draft.operation) {
                setHeaderLeave(true);
                return;
              }
              if (router.canGoBack()) router.back();
              else router.replace('/(tabs)/products');
            }}
          />
        }
        scroll
        contentClassName="gap-3 px-4 pt-2 pb-6"
        footer={
          <ActionBar>
            {flaggedCount && !draft.operation ? (
              <Text variant="caption" className="text-center text-danger" accessibilityRole="alert">
                {t('fieldsToCorrect', { count: flaggedCount })}
              </Text>
            ) : null}
            {draft.operation ? (
              <>
                <Button
                  label={t('sendAgain')}
                  variant="accent"
                  loading={busy}
                  disabled={pendingUpload}
                  onPress={() => void resend()}
                />
                <Button
                  label={t('checkOperation')}
                  variant="secondary"
                  disabled={busy || pendingUpload}
                  onPress={() => void recover()}
                />
              </>
            ) : (
              <Button
                label={t('review')}
                variant="accent"
                loading={busy}
                disabled={locked || pendingUpload || (Boolean(id) && !dirty)}
                onPress={() => {
                  if (check()) {
                    setValidation([]);
                    setReviewing(true);
                  }
                }}
              />
            )}
          </ActionBar>
        }>
        {unconfirmed ? (
          <Banner
            tone="danger"
            title={t('unconfirmedTitle')}
            message={t(
              unconfirmed.operation?.state === 'failed' ? 'operationFailed' : 'unconfirmedBody'
            )}
          />
        ) : null}
        {error && !(error instanceof ProductEditorUnconfirmed) ? (
          <Banner
            tone="danger"
            title={error instanceof ProductEditorNotReceived ? t('notReceivedTitle') : undefined}
            message={
              error instanceof ProductEditorNotReceived ? t('notReceivedBody') : describe(error)
            }
          />
        ) : null}
        {pendingUpload ? <Banner tone="info" message={t('finishUpload')} /> : null}
        {validation.length ? (
          <Banner
            tone="danger"
            title={t('validationTitle')}
            message={t('validationBody', {
              fields: [...new Set(validation.map(fieldName))].join(', '),
            })}
          />
        ) : null}
        {conflict ? (
          <View className="gap-3 rounded-xl bg-surface p-4">
            <Banner
              tone="warning"
              title={t('conflictTitle')}
              message={t('conflictBody', {
                fields: [...new Set(conflict.fields.map((field) => field.split('.')[0]!))]
                  .map(fieldName)
                  .join(', '),
              })}
            />
            <Button
              label={t('keepMyChanges')}
              variant="primary"
              onPress={() => {
                setDraft((previous) => ({
                  ...previous,
                  base: conflict.current,
                  values: { ...conflict.current.values, ...conflict.request.changes },
                }));
                setConflict(null);
                setReviewing(true);
              }}
            />
            <Button
              label={t('useCurrentValues')}
              variant="secondary"
              onPress={() => {
                setDraft((previous) => ({
                  ...previous,
                  base: conflict.current,
                  values: storeValuesInConflict(conflict),
                }));
                setConflict(null);
              }}
            />
          </View>
        ) : null}
        {sections.map((item) => {
          const refused = flagged.get(item.key);
          return (
            <FormSection
              key={item.key}
              id={item.key}
              title={t(`sections.${item.key}`)}
              icon={SECTION_ICONS[item.key]}
              summary={
                refused
                  ? refused.length
                    ? t('needsAttention', {
                        fields: [...new Set(refused.map(fieldName))].join(', '),
                      })
                    : t('checkNumbers')
                  : summaries[item.key]
              }
              invalid={Boolean(refused)}
              open={open.has(item.key)}
              onToggle={() =>
                setOpen((previous) => {
                  const next = new Set(previous);
                  if (next.has(item.key)) next.delete(item.key);
                  else next.add(item.key);
                  return next;
                })
              }>
              {item.content}
            </FormSection>
          );
        })}
        {offered.length ? (
          <View className="mt-3">
            <SectionLabel title={t('productActions')} />
            <RowGroup>
              {offered.map((item) => (
                <ActionRow
                  key={item}
                  title={t(`actions.${item}`)}
                  icon={item === 'delete' ? 'trash' : 'refresh'}
                  destructive={item === 'delete'}
                  disabled={locked || pendingUpload || dirty}
                  onPress={() => setPendingAction(item)}
                />
              ))}
            </RowGroup>
            {dirty ? (
              <Text variant="caption" className="px-4 pt-2">
                {t('saveBeforeAction')}
              </Text>
            ) : null}
          </View>
        ) : null}
        <ConfirmSheet
          visible={reviewing}
          title={t(id ? 'reviewChangesTitle' : 'reviewNewTitle')}
          body={t('reviewHint')}
          confirmLabel={t(id ? 'saveProduct' : 'createProduct')}
          cancelLabel={t('keepEditing')}
          tone="accent"
          loading={busy}
          onCancel={() => setReviewing(false)}
          onConfirm={() => void submit()}>
          <View className="gap-3">
            <RowGroup bare>
              <ValueRow label={t('name')} value={draft.values.name || t('missing')} />
              <ValueRow label={t('category')} value={category?.name ?? t('missing')} />
              <ValueRow
                label={t('format')}
                value={t(
                  draft.values.shipping?.isPhysicalProduct === false
                    ? 'formats.digital'
                    : 'formats.physical'
                )}
              />
              <ValueRow label={t('sections.pricing')} value={summaries.pricing} />
              <ValueRow label={t('sections.media')} value={summaries.media} />
              <ValueRow label={t('sections.variants')} value={summaries.variants} />
              <ValueRow label={t('sections.availability')} value={summaries.availability} />
            </RowGroup>
            {id && changedSections.length ? (
              <Text variant="meta">
                {t('changedSections', {
                  sections: changedSections.map((section) => t(`sections.${section}`)).join(', '),
                })}
              </Text>
            ) : null}
            {draft.base?.pricing?.price ? (
              <Text variant="caption">
                {t('lastSavedPrice', { price: draft.base.pricing.price.formatted })}
              </Text>
            ) : null}
          </View>
        </ConfirmSheet>
        <ConfirmSheet
          visible={Boolean(leave) || headerLeave}
          title={t('discardTitle')}
          body={t('discardBody')}
          confirmLabel={t('discard')}
          cancelLabel={t('keepEditing')}
          tone="danger"
          onCancel={() => {
            setLeave(null);
            setHeaderLeave(false);
          }}
          onConfirm={() => {
            removeProductDraft(draftKey);
            const next = leave;
            setLeave(null);
            setHeaderLeave(false);
            if (next) navigation.dispatch(next);
            else {
              departure.current = () => {
                if (router.canGoBack()) router.back();
                else router.replace('/(tabs)/products');
              };
              setAllowLeave(true);
            }
          }}
        />
        <ConfirmSheet
          visible={Boolean(pendingAction)}
          title={
            pendingAction
              ? t('actionTitle', { action: t(`actions.${pendingAction}`) })
              : t('productActions')
          }
          body={pendingAction === 'delete' ? t('deleteBody') : t('publishBody')}
          confirmLabel={pendingAction ? t(`actions.${pendingAction}`) : t('review')}
          cancelLabel={t('keepEditing')}
          tone={pendingAction === 'delete' ? 'danger' : 'accent'}
          loading={action.isPending}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => void performAction()}>
          {pendingAction === 'delete'
            ? draft.base?.dependencies.map((dependency) => (
                <Text key={dependency.kind}>{dependency.message}</Text>
              ))
            : null}
        </ConfirmSheet>
      </Screen>
    </EditorValidationContext>
  );
}

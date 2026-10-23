import { useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { SelectField, type SelectFieldProps } from '@/components/ui/select-field';
import { ErrorState } from '@/components/ui/state-view';
import { SwitchSection } from '@/components/ui/switch';
import { RowGroup, ValueRow } from '@/components/ui/rows';
import { type ReturnRefundBreakdown } from '@/contracts/mobile/biz/v1';
import { ApiError, isApiError } from '@/api/errors';
import { useOpenDashboard, useOpenPage } from '@/features/web/use-open-page';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  ReturnNotReceived,
  ReturnScopeChanged,
  ReturnUnconfirmed,
  useReturnAttachmentAccess,
  type useReturnWrite,
} from './use-returns';
export { CreationNumber as ReturnNumber } from '@/features/orders/creation/controls';

/** A choice from a list: the shared select field. */
export function ReturnChoice({
  value,
  ...props
}: Omit<SelectFieldProps, 'value'> & { value?: string }) {
  return <SelectField value={value ?? ''} {...props} />;
}

/** A yes/no setting standing on the page, and the fields it brings while on, in one card. */
export function ReturnToggle({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <SwitchSection title={label} value={value} onChange={onChange} disabled={disabled}>
      {children}
    </SwitchSection>
  );
}
export function ReturnError({ error }: { error: unknown }) {
  const t = useTranslations('returns');
  const describe = useErrorMessage();
  if (!error || error instanceof ReturnScopeChanged) return null;
  if (isApiError(error) && (error.code === 'ROUTE_NOT_FOUND' || [405, 501].includes(error.status)))
    return <ReturnUnavailable error={error} retry={() => undefined} />;
  if (error instanceof ReturnNotReceived)
    return <Banner tone="warning" title={t('notReceivedTitle')} message={t('notReceivedBody')} />;
  return (
    <Banner
      tone="danger"
      message={error instanceof ReturnUnconfirmed ? t('unconfirmed') : describe(error)}
    />
  );
}
/** A form opened without what it is for (no order, no return): there is nothing to load. */
export function ReturnMissing() {
  return <ErrorState error={new ApiError(404, 'NOT_FOUND', '')} />;
}
type ReturnWordGroup = 'status' | 'settlement' | 'conditions' | 'destinationMethods';
/** A store word of a return in the operator's language when the app knows it, else as sent. */
export function useReturnWord() {
  const t = useTranslations('returns');
  return (group: ReturnWordGroup, word: string) =>
    t.has(`${group}.${word}` as never) ? t(`${group}.${word}` as never) : word;
}
export function ReturnWarnings({ warnings }: { warnings: readonly string[] }) {
  const words = useTranslations('errors.reason');
  return warnings.map((warning, index) => (
    <Banner
      key={index}
      tone="warning"
      message={words.has(warning as never) ? words(warning as never) : warning}
    />
  ));
}
export function ReturnUnavailable({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations('returns');
  const common = useTranslations('common');
  const openDashboard = useOpenDashboard();
  if (isApiError(error) && (error.code === 'ROUTE_NOT_FOUND' || [405, 501].includes(error.status)))
    return (
      <Banner
        tone="warning"
        title={t('unavailableTitle')}
        message={t('unavailableBody')}
        action={
          openDashboard ? { label: common('openWebsite'), onPress: openDashboard } : undefined
        }
      />
    );
  return <ErrorState error={error} onRetry={retry} />;
}
export function ReturnRecovery({
  writer,
  onResult,
  onError,
}: {
  writer: ReturnType<typeof useReturnWrite>;
  onResult: (result: Awaited<ReturnType<typeof writer.recover>>) => void;
  onError: (error: unknown) => void;
}) {
  const t = useTranslations('returns');
  return writer.attempt ? (
    <>
      <Banner tone="warning" message={t('unconfirmed')} />
      <Button
        label={t('checkOriginal')}
        loading={writer.isPending}
        onPress={() => void writer.recover().then(onResult).catch(onError)}
      />
    </>
  ) : null;
}
export function ReturnBreakdown({ value }: { value: ReturnRefundBreakdown }) {
  const t = useTranslations('returns');
  return (
    <RowGroup>
      {(
        [
          'subtotal',
          'discount',
          'tax',
          'shipping',
          'restockingFee',
          'returnShippingFee',
          'total',
        ] as const
      ).map((key) => (
        <ValueRow key={key} label={t(`totals.${key}`)} value={value[key].formatted} />
      ))}
    </RowGroup>
  );
}
export function ReturnAttachment({
  id,
  uploadId,
  label,
}: {
  id: string;
  uploadId?: string;
  label: string;
}) {
  const access = useReturnAttachmentAccess();
  const openPage = useOpenPage();
  const [error, setError] = useState<unknown>(null);
  return (
    <>
      <Button
        label={label}
        variant="secondary"
        loading={access.isPending}
        onPress={() =>
          void access
            .review({ id, uploadId })
            .then((result) => openPage(result.url, label))
            .catch(setError)
        }
      />
      <ReturnError error={error} />
    </>
  );
}

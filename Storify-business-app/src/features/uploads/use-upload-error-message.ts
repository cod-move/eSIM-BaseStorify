import { useTranslations } from 'use-intl';

import { useErrorMessage } from '@/i18n/use-error-message';

import { UploadSelectionError } from './selected-file';
import { UploadCancelled, UploadOutcomeUnconfirmed, UploadScopeChanged } from './use-upload';

/** Selection failures are local; server refusals retain their reason-first wording. */
export function useUploadErrorMessage(): (error: unknown) => string {
  const t = useTranslations('uploads.errors');
  const serverMessage = useErrorMessage();
  return (error) => {
    if (error instanceof UploadSelectionError) return t(error.reason);
    if (error instanceof UploadCancelled) return t('cancelled');
    if (error instanceof UploadScopeChanged) return t('scopeChanged');
    if (error instanceof UploadOutcomeUnconfirmed) return serverMessage(error.refusal);
    return serverMessage(error);
  };
}

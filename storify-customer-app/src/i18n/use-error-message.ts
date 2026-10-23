import { useTranslations } from 'use-intl';

import { isApiError, isNetworkError } from '@/api/errors';

/**
 * Turns an error into a sentence for the shopper, in their language.
 *
 * The store explains a refusal twice: `reason` in its own terms ("out of
 * stock"), `code` by category ("conflict"). The app has a translation for the
 * ones it knows under `errors.reason.*` and `errors.code.*`. The store's own
 * sentence is English, so it is the last thing tried before the generic one.
 */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('errors');
  const tOffline = useTranslations('offline');

  return (error) => {
    if (isNetworkError(error)) return error.kind === 'timeout' ? t('timeout') : tOffline('message');

    if (isApiError(error)) {
      // The keys are built from what the store sent, so they cannot be typed.
      const reason = `reason.${error.reason}` as never;
      if (error.reason && t.has(reason)) return t(reason);

      const code = `code.${error.code}` as never;
      if (t.has(code)) return t(code);

      if (error.message) return error.message;
    }
    return t('generic');
  };
}

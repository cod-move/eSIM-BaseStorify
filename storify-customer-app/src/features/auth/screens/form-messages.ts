import { useCallback } from 'react';
import { useTranslations } from 'use-intl';

import type { AuthError } from '../auth-request';
import type { AuthField } from '../auth-error-message';
import type { AuthValidationKey } from '../schemas';

/** Words a form check's message, which is the key of its sentence under `auth.validation`. */
export function useValidationMessage(): (key: string | undefined) => string | undefined {
  const t = useTranslations('auth.validation');
  return useCallback((key) => (key ? t(key as AuthValidationKey) : undefined), [t]);
}

/** The store's refusal, when it belongs beside `field`. */
export function errorFor(error: AuthError | null, field: AuthField): string | undefined {
  return error?.field === field ? error.message : undefined;
}

/** The store's refusal, when it belongs to the whole form. */
export function formErrorOf(error: AuthError | null): string | undefined {
  return error && error.field === null ? error.message : undefined;
}

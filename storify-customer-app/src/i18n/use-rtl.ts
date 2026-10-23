import { I18nManager, Platform } from 'react-native';

import { useLocale } from './locale-store';
import { isRtlLocale } from './locales';

/**
 * Whether the layout runs right to left now. A phone fixes its direction when
 * the app starts (`direction.ts`), so it is the system's; the web follows the
 * language at once.
 */
export function useRtl(): boolean {
  const locale = useLocale();
  return Platform.OS === 'web' ? isRtlLocale(locale) : I18nManager.isRTL;
}

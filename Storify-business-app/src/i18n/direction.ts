import { reloadAppAsync } from 'expo';
import { I18nManager, Platform } from 'react-native';

import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { isRtlLocale } from './locales';

/**
 * Makes the layout run in the direction of the app's language, which is the
 * operator's choice and need not be the phone's language.
 *
 * React Native fixes the direction when the app starts, so a change between a
 * left-to-right and a right-to-left language restarts the app. The setting is
 * remembered by the system: the next start is already in the right direction.
 *
 * The restart is tried once for a change. Where it does not change the
 * direction (Expo Go resets the setting; a build can have right-to-left layout
 * switched off), the app carries on in the direction it has, instead of
 * restarting for ever.
 *
 * Returns true when the app is restarting, so the caller can stop drawing.
 */
export function applyDirection(locale: string): boolean {
  const rtl = isRtlLocale(locale);

  if (Platform.OS === 'web') {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    return false;
  }

  if (I18nManager.isRTL === rtl) {
    storage.remove(STORAGE_KEYS.directionRestart);
    return false;
  }

  const wanted = rtl ? 'rtl' : 'ltr';
  if (storage.get(STORAGE_KEYS.directionRestart) === wanted) return false;
  storage.set(STORAGE_KEYS.directionRestart, wanted);

  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  void reloadAppAsync('The layout direction changed');
  return true;
}

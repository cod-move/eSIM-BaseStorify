import { useEffect, useState } from 'react';

import { useSession } from '@/features/auth/use-session';
import { pushPlatform } from '@/features/devices/use-push-registration';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { usePushPermission } from './use-push-permission';

/**
 * The one moment the app explains push notifications and offers to turn them on:
 * a signed-in shopper, on a phone that can receive them, who was never asked.
 * The flag is written as the sheet opens, so "Not now" and a refusal both mean
 * the app does not ask again on its own; Settings is the other way in.
 */
export function usePushMoment() {
  const { isSignedIn } = useSession();
  const { state, request } = usePushPermission();
  // Read once, when the screen opens: this screen's own write below must not close its sheet.
  const [asked] = useState(() => storage.get(STORAGE_KEYS.pushAsked) !== null);
  const [closed, setClosed] = useState(false);

  const open =
    !asked && !closed && isSignedIn && pushPlatform() !== null && state === 'undetermined';

  useEffect(() => {
    if (open) storage.set(STORAGE_KEYS.pushAsked, '1');
  }, [open]);

  return {
    open,
    close: () => setClosed(true),
    allow: async () => {
      setClosed(true);
      await request();
    },
  };
}

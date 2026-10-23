import { useEffect, useState } from 'react';

import { useGate } from '@/api/gate';
import { storage } from '@/lib/storage';
import { STORAGE_KEYS } from '@/lib/storage-keys';

import { usePushPermission } from './use-push-permission';

/** The tabs settle first: the moment never lands on the move from sign-in. */
const SETTLE_MS = 1200;

/**
 * The one moment the app explains push notifications and offers to turn them
 * on: the first time the tabs open on a phone that can
 * receive them and was never asked, and not over the update screen. The flag
 * is written as the sheet opens, so "Not now", a refusal and leaving the app
 * all mean the app does not ask again by itself; the notifications screen is
 * the way back.
 */
export function usePushMoment() {
  const { state, request } = usePushPermission();
  const updateRequired = useGate((gate) => gate.updateRequired !== null);
  // Read once: this moment's own write below must not close its sheet.
  const [asked] = useState(() => storage.get(STORAGE_KEYS.pushAsked) !== null);
  const [settled, setSettled] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);

  const open = !asked && !closed && settled && !updateRequired && state === 'undetermined';

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

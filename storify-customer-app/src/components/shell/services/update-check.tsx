import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';

/**
 * At cold start, asks the update channel whether a fix is waiting and downloads
 * it in the background. The app never reloads itself: the update is used the
 * next time the app starts, so a shopper in the middle of a checkout is never
 * cut off. Does nothing in development, or when updates are off.
 */
export function UpdateCheck() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current || __DEV__ || !Updates.isEnabled) return;
    started.current = true;

    void (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (check.isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // No network, or the channel is down: the next start asks again.
      }
    })();
  }, []);

  return null;
}

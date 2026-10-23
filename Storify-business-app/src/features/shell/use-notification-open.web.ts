import { usePendingNotificationOpen } from './use-open-notification';

/**
 * The browser preview receives no push notifications (expo-notifications has
 * no responses on the web), so there is no tap to open. A notification opened
 * from the notifications screen may still wait for its workspace.
 */
export function useNotificationOpen(): void {
  usePendingNotificationOpen();
}

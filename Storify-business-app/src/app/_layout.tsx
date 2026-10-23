// First, before anything that formats a message: see the file for why.
import '@/i18n/polyfills';
import '../global.css';

import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { LoadingState } from '@/components/ui/state-view';
import { ToastHost } from '@/components/ui/toast';
import type { Capability } from '@/contracts/mobile/biz/v1';
import { useSession } from '@/features/auth/use-session';
import { useSessionSync } from '@/features/auth/use-session-sync';
import { useSigningOut } from '@/features/auth/use-sign-out';
import { AppGate } from '@/features/config/app-gate';
import { usePushRefresh } from '@/features/devices/use-push-refresh';
import { usePushRegistration } from '@/features/devices/use-push-registration';
import { useOrderPushRefresh } from '@/features/orders/use-order-push-refresh';
import { Booting } from '@/features/shell/booting';
import { CrashScreen } from '@/features/shell/crash-screen';
import { useNotificationOpen } from '@/features/shell/use-notification-open';
import { useWorkspace } from '@/features/workspace/use-workspace';
import { useWorkspaceSync } from '@/features/workspace/use-workspace-sync';
import { applyDirection } from '@/i18n/direction';
import { useLocaleStore } from '@/i18n/locale-store';
import { AppProviders } from '@/providers/app-providers';

// The splash screen stays until `AppGate` has something to show.
void SplashScreen.preventAutoHideAsync();

// The layout's direction follows the app's language. When the two disagree the
// app restarts itself, once, and there is nothing to draw in the meantime.
const restarting = applyDirection(useLocaleStore.getState().locale);

export default function RootLayout() {
  if (restarting) return null;

  return (
    <AppProviders>
      <AppGate>
        <Screens />
      </AppGate>
    </AppProviders>
  );
}

/**
 * A screen that crashed while drawing. The layout's providers went down with
 * it, so the crash screen brings its own.
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <AppProviders>
      <CrashScreen {...props} />
    </AppProviders>
  );
}

/**
 * The route map. Which screens exist follows the session
 * and GET /me, never a screen's own navigation: signed out, only sign-in
 * and forgot password;
 * signed in, the workspace choice, "no access", or the tabs and the screens
 * above them. A screen above the tabs that needs a capability exists only
 * with it, as its tab does.
 */
function Screens() {
  useSessionSync();
  useWorkspaceSync();
  usePushRegistration();
  usePushRefresh();
  useNotificationOpen();
  useOrderPushRefresh();

  const { isSignedIn, isPending } = useSession();
  const workspace = useWorkspace();
  // Whether the session has been known once. The auth client asks again behind
  // the screen (after a sign-in step, on the foreground); that must not take the
  // screens down, or the sign-in screen would lose the step it is on.
  const [sessionKnown, setSessionKnown] = useState(!isPending || isSignedIn);
  if (!sessionKnown && (!isPending || isSignedIn)) setSessionKnown(true);
  const ready = isSignedIn && workspace.status === 'ready';
  const can = (capability: Capability) =>
    workspace.status === 'ready' && workspace.access.capabilities.includes(capability);

  // Signed in, GET /me on its way: sign-in stays the route underneath until the
  // workspace is known, then gives way to the tabs or the choice.
  const loadingMe = isSignedIn && workspace.status === 'loading';
  const booting = !sessionKnown || loadingMe;
  // On the way out, the signed-in screens are covered until the session is gone.
  const signingOut = useSigningOut();
  const covered = booting || signingOut;

  return (
    <>
      <View
        className="flex-1"
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={covered}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={!isSignedIn || loadingMe}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          <Stack.Protected guard={!isSignedIn}>
            <Stack.Screen name="forgot-password" />
          </Stack.Protected>
          <Stack.Protected guard={isSignedIn && workspace.status === 'choose'}>
            <Stack.Screen name="choose-workspace" />
          </Stack.Protected>
          <Stack.Protected guard={isSignedIn && workspace.status === 'none'}>
            <Stack.Screen name="no-access" />
          </Stack.Protected>

          <Stack.Protected guard={ready}>
            <Stack.Screen name="(tabs)" />
            <Stack.Protected guard={can('CREATE_ORDERS')}>
              <Stack.Screen name="orders/new" />
            </Stack.Protected>
            <Stack.Screen name="more/account/index" />
            <Stack.Screen name="more/account/password" />
            <Stack.Screen name="more/account/two-step" />
            <Stack.Screen name="more/notifications" />
            <Stack.Screen name="web" />
            <Stack.Screen
              name="viewer"
              options={{ presentation: 'transparentModal', animation: 'fade' }}
            />
            <Stack.Protected guard={can('VIEW_ORDERS')}>
              <Stack.Screen name="orders/[id]" />
            </Stack.Protected>
            <Stack.Protected guard={can('VIEW_RETURNS')}>
              <Stack.Screen name="returns/index" />
              <Stack.Screen name="returns/[id]/index" />
              <Stack.Screen name="refunds/[id]" />
            </Stack.Protected>
            <Stack.Protected guard={can('HANDLE_RETURNS')}>
              <Stack.Screen name="returns/new" />
              <Stack.Screen name="returns/[id]/action" />
            </Stack.Protected>
            <Stack.Protected guard={can('ISSUE_REFUNDS')}>
              <Stack.Screen name="refunds/new" />
            </Stack.Protected>
            <Stack.Protected guard={can('VIEW_PRODUCTS')}>
              <Stack.Screen name="products/[id]/index" />
              <Stack.Screen name="scanner" options={{ presentation: 'fullScreenModal' }} />
            </Stack.Protected>
            <Stack.Protected guard={can('CREATE_PRODUCTS')}>
              <Stack.Screen name="products/new" />
            </Stack.Protected>
            <Stack.Protected guard={can('EDIT_PRODUCTS')}>
              <Stack.Screen name="products/[id]/edit" />
            </Stack.Protected>
            <Stack.Protected guard={can('VIEW_STOCK')}>
              <Stack.Screen name="products/[id]/stock" />
              <Stack.Screen name="products/[id]/stock-history" />
            </Stack.Protected>
            <Stack.Protected guard={can('VIEW_INBOX')}>
              <Stack.Screen name="conversations/[id]" />
            </Stack.Protected>
            <Stack.Protected guard={can('VIEW_ORDER_CUSTOMERS')}>
              <Stack.Screen name="customers/index" />
              <Stack.Screen name="customers/[id]/index" />
            </Stack.Protected>
            <Stack.Protected guard={can('VIEW_ORDER_CUSTOMERS') && can('VIEW_ORDERS')}>
              <Stack.Screen name="customers/[id]/orders" />
            </Stack.Protected>
            <Stack.Protected guard={can('VIEW_PAYOUTS')}>
              <Stack.Screen name="more/payouts" />
              <Stack.Screen name="payouts/[id]" />
            </Stack.Protected>
            <Stack.Protected guard={can('REVIEW_VENDOR_APPLICATIONS')}>
              <Stack.Screen name="more/applications" />
              <Stack.Screen name="applications/[id]" />
            </Stack.Protected>
          </Stack.Protected>

          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="dev/kit" />
          </Stack.Protected>
        </Stack>
      </View>
      {/* Over the screens, never instead of them: a screen taken down would lose its state. */}
      {booting ? (
        <View className="absolute inset-0" accessibilityViewIsModal>
          <Booting />
        </View>
      ) : signingOut ? (
        <View className="absolute inset-0 bg-background pt-safe" accessibilityViewIsModal>
          <LoadingState shape="spinner" />
        </View>
      ) : null}
      <ToastHost />
    </>
  );
}

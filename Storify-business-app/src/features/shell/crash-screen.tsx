import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { ErrorState } from '@/components/ui/state-view';
import { reportError } from '@/lib/monitoring';

/**
 * What shows when drawing a screen threw an error nothing expected, instead of
 * an app that closes: the error is reported (`lib/monitoring`), and "Try
 * again" draws the screens again. The root layout's error boundary shows it.
 */
export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <View className="flex-1 bg-background pt-safe">
      <ErrorState error={error} onRetry={() => void retry()} />
    </View>
  );
}

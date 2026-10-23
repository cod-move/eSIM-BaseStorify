import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Reads a screen's data again each time the screen comes back into view:
 * returning from a row it opened, or to its tab, which stays mounted behind the
 * others. Not on the first showing, which reads it anyway.
 */
export function useRefetchOnFocus(refetch: () => unknown): void {
  const shown = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (shown.current) void refetch();
      shown.current = true;
    }, [refetch])
  );
}

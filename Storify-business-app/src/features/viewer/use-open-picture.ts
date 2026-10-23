import { router } from 'expo-router';
import { useCallback } from 'react';

/**
 * Opens a picture full screen inside the app (`/viewer`), to zoom into: a
 * picture in a conversation. `title` is its name over it; without one it is
 * "Picture".
 */
export function useOpenPicture(): (url: string, title?: string) => void {
  return useCallback((url: string, title?: string) => {
    router.push({ pathname: '/viewer', params: title ? { url, title } : { url } });
  }, []);
}

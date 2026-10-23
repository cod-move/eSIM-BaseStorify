import { router } from 'expo-router';
import { useCallback } from 'react';

import { useConfig } from '@/features/config/use-config';

/**
 * Opens a web page inside the app (`/web`): a page of the store's website, a
 * carrier's tracking page, a file behind a short-lived link. The operator
 * never leaves the app for a website. `title` is the header's; without one
 * the header shows the store's name on its own website, else the page's host.
 */
export function useOpenPage(): (url: string, title?: string) => void {
  return useCallback((url: string, title?: string) => {
    router.push({ pathname: '/web', params: title ? { url, title } : { url } });
  }, []);
}

/**
 * Opens the store's web dashboard inside the app, for what the app leaves to
 * the website (a refund it cannot make, a seller's first payment, photos in a
 * reply). `undefined` when the store gives no dashboard address.
 */
export function useOpenDashboard(): (() => void) | undefined {
  const dashboardUrl = useConfig().data?.store.dashboardUrl;
  const openPage = useOpenPage();
  return dashboardUrl ? () => openPage(dashboardUrl) : undefined;
}

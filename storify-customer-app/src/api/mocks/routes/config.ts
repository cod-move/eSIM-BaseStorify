/** The store's settings. */
import { config } from '../fixtures/config';
import type { MockRoute } from '../kit';
import { mockAuthSettings } from './auth';

export const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/config',
    handle: ({ locale }) => {
      const settings = config(locale);
      // Google sign-in, while a test has switched it on (`setMockAuthSettings`).
      const { googleWebClientId } = mockAuthSettings();
      if (!googleWebClientId) return settings;
      return {
        ...settings,
        auth: { ...settings.auth, google: { webClientId: googleWebClientId } },
      };
    },
  },
];

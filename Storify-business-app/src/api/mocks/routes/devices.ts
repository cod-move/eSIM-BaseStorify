/** POST /devices and DELETE /devices/{token}: this phone's push token. */
import { DEVICE_PLATFORMS } from '@/contracts/mobile/biz/v1';

import { textOf } from '../fixtures/shared';
import { accountOf, bodyOf, invalid, type MockRoute } from '../kit';

/** Token → whose it is and the locale its links open in. */
const devices = new Map<string, { accountId: string; platform: string; locale: string }>();

/** The tokens registered now: for a test of registration and sign-out. */
export function registeredDevices(): string[] {
  return [...devices.keys()];
}

export function reset(): void {
  devices.clear();
}

export const routes: MockRoute[] = [
  {
    method: 'POST',
    path: '/devices',
    access: 'account',
    handle: (ctx) => {
      const body = bodyOf(ctx);
      const token = textOf(body, 'token');
      const platform = textOf(body, 'platform');
      if (!token || token.length > 200) throw invalid('token', 'Send the Expo push token');
      if (!platform || !(DEVICE_PLATFORMS as readonly string[]).includes(platform)) {
        throw invalid('platform', `Expected one of: ${DEVICE_PLATFORMS.join(', ')}`);
      }
      devices.set(token, { accountId: accountOf(ctx).id, platform, locale: ctx.locale });
      return { token, platform, locale: ctx.locale };
    },
  },
  {
    method: 'DELETE',
    path: /^\/devices\/([^/]+)$/,
    access: 'account',
    handle: (ctx, [token = '']) => {
      const device = devices.get(token);
      const removed = device?.accountId === accountOf(ctx).id;
      if (removed) devices.delete(token);
      return { removed };
    },
  },
];

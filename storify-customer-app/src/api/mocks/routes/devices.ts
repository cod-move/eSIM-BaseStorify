/** Push devices: registering this phone's token, and removing it. */
import { RegisterDeviceRequest } from '@/contracts/mobile/shop/v1';

import { PUSH_TOKEN, deleteDevice, resetDevices, saveDevice } from '../fixtures/devices';
import { MockError, requireUser, type MockRoute } from '../kit';

export const routes: MockRoute[] = [
  {
    method: 'POST',
    path: '/devices',
    handle: (ctx) => {
      const user = requireUser(ctx);
      const body = RegisterDeviceRequest.safeParse(ctx.body);
      if (!body.success || !PUSH_TOKEN.test(body.data.token)) {
        throw new MockError(400, 'VALIDATION_ERROR', 'Not an Expo push token');
      }
      const device = { ...body.data, locale: ctx.locale };
      saveDevice(device, user.id);
      return device;
    },
  },
  {
    method: 'DELETE',
    path: /^\/devices\/([^/]+)$/,
    handle: (ctx, [token = '']) => ({ removed: deleteDevice(token, requireUser(ctx).id) }),
  },
];

export const reset = resetDevices;

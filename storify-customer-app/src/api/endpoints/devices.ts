/** Endpoints: this phone's push token. */
import { Device, DeviceRemoval, type RegisterDeviceRequest } from '@/contracts/mobile/shop/v1';

import { api } from '../api';

/** Registers the token for the signed-in shopper; the locale is the one its links open in. */
export function registerDevice(locale: string, body: RegisterDeviceRequest) {
  return api.data({ locale, path: '/devices', method: 'POST', body, auth: 'user' }, Device);
}

/** Stops this phone's notifications. Only this phone: the shopper's others keep theirs. */
export function removeDevice(locale: string, token: string) {
  return api.data(
    { locale, path: `/devices/${encodeURIComponent(token)}`, method: 'DELETE', auth: 'user' },
    DeviceRemoval
  );
}

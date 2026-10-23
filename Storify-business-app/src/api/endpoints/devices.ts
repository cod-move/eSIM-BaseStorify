/** Endpoints: this phone's push token. */
import { Device, DeviceRemoval, type RegisterDeviceRequest } from '@/contracts/mobile/biz/v1';

import { api } from '../api';

/** POST /devices: registers the token for the operator; the locale is the one its links open in. */
export function registerDevice(locale: string, body: RegisterDeviceRequest) {
  return api.data({ locale, path: '/devices', method: 'POST', body }, Device);
}

/** DELETE /devices/{token}: stops this phone's notifications, while the session still allows it. */
export function removeDevice(locale: string, token: string) {
  return api.data(
    { locale, path: `/devices/${encodeURIComponent(token)}`, method: 'DELETE' },
    DeviceRemoval
  );
}

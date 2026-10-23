/** The mock store's data for: push devices. Whoever registered a token last owns it. */
import type { Device } from '@/contracts/mobile/shop/v1';

/** Expo's push token, as the store checks it. */
export const PUSH_TOKEN = /^Expo(nent)?PushToken\[.+\]$/;

const devices = new Map<string, Device & { userId: string }>();

export function resetDevices(): void {
  devices.clear();
}

export function saveDevice(device: Device, userId: string): void {
  devices.set(device.token, { ...device, userId });
}

/** True when the token was the shopper's and now is no more. */
export function deleteDevice(token: string, userId: string): boolean {
  if (devices.get(token)?.userId !== userId) return false;
  return devices.delete(token);
}

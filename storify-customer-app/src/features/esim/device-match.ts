import type { EsimDevices } from '@/contracts/mobile/shop/v1/esim';

/**
 * Whether this phone is in the store's device table (APP-05). Pure.
 *
 * iPhones report their marketing name ("iPhone 15 Pro"), which the table
 * uses; most Android phones report a model code ("SM-S918B"), which it does
 * not — those come out `unknown`, and the shopper looks their phone up.
 */
export type DeviceVerdict =
  | { kind: 'supported'; brand: string; model: string; note?: string }
  | { kind: 'unsupported'; brand: string; model: string; note?: string }
  | { kind: 'unknown'; brand: string | null };

const plain = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function matchDevice(
  devices: EsimDevices,
  phone: { brand: string | null; manufacturer: string | null; modelName: string | null }
): DeviceVerdict {
  const said = [phone.brand, phone.manufacturer].filter(Boolean).map((name) => plain(name!));
  const brand =
    devices.brands.find((entry) => said.includes(plain(entry.brand))) ??
    (phone.modelName && /^iP(hone|ad)/.test(phone.modelName)
      ? devices.brands.find((entry) => plain(entry.brand) === 'apple')
      : undefined);
  if (!brand || !phone.modelName) return { kind: 'unknown', brand: brand?.brand ?? phone.brand };
  const wanted = plain(phone.modelName);
  const model = brand.models.find(
    (entry) => plain(entry.name) === wanted || plain(`${brand.brand} ${entry.name}`) === wanted
  );
  if (!model) return { kind: 'unknown', brand: brand.brand };
  return {
    kind: model.supported ? 'supported' : 'unsupported',
    brand: brand.brand,
    model: model.name,
    ...(model.note ? { note: model.note } : {}),
  };
}

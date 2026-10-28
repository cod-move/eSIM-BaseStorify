import { matchDevice } from '../device-match';

const devices = {
  brands: [
    {
      brand: 'Apple',
      models: [
        { name: 'iPhone 15 Pro', supported: true, note: 'Not the mainland China model.' },
        { name: 'iPhone 8', supported: false },
      ],
    },
    { brand: 'Google', models: [{ name: 'Pixel 8', supported: true }] },
  ],
};

describe('this phone in the device table', () => {
  it('finds an iPhone by its marketing name', () => {
    expect(
      matchDevice(devices, { brand: 'Apple', manufacturer: 'Apple', modelName: 'iPhone 15 Pro' })
    ).toEqual({
      kind: 'supported',
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      note: 'Not the mainland China model.',
    });
    expect(
      matchDevice(devices, { brand: null, manufacturer: null, modelName: 'iPhone 8' }).kind
    ).toBe('unsupported');
  });

  it('finds an Android phone named as the table names it, brand in any case', () => {
    expect(
      matchDevice(devices, { brand: 'google', manufacturer: 'Google', modelName: 'Pixel 8' }).kind
    ).toBe('supported');
  });

  it('a model code it cannot read is unknown, with the brand to search', () => {
    expect(
      matchDevice(devices, { brand: 'google', manufacturer: 'Google', modelName: 'GKWS6' })
    ).toEqual({
      kind: 'unknown',
      brand: 'Google',
    });
    expect(
      matchDevice(devices, { brand: 'samsung', manufacturer: 'samsung', modelName: 'SM-S918B' })
    ).toEqual({
      kind: 'unknown',
      brand: 'samsung',
    });
  });
});

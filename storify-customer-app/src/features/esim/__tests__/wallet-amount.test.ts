import { centsOf } from '../wallet-view';

jest.mock('expo-router', () => ({ useRouter: jest.fn() }));

describe('an amount typed for the balance', () => {
  it('reads whole and decimal amounts as cents, without floats', () => {
    expect(centsOf('20')).toBe(2000);
    expect(centsOf('20.5')).toBe(2050);
    expect(centsOf(' 19.99 ')).toBe(1999);
    expect(centsOf('0,1')).toBe(10);
  });

  it('refuses what is not an amount', () => {
    expect(centsOf('')).toBeNull();
    expect(centsOf('abc')).toBeNull();
    expect(centsOf('1.234')).toBeNull();
    expect(centsOf('-5')).toBeNull();
  });
});

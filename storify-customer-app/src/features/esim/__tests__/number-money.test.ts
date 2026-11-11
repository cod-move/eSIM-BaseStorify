import { parseCardAmount, rechargeValid } from '../number-money';

describe('an amount typed for a number', () => {
  it('reads whole and decimal amounts as cents, without floats', () => {
    expect(parseCardAmount('12')).toBe(1200);
    expect(parseCardAmount('12.5')).toBe(1250);
    expect(parseCardAmount('0,07')).toBe(7);
    expect(parseCardAmount('0')).toBeNull();
    expect(parseCardAmount('1.234')).toBeNull();
    expect(parseCardAmount('abc')).toBeNull();
  });

  it('takes whole credit amounts within the bounds only', () => {
    expect(rechargeValid(500, 200, 30_000)).toBe(true);
    expect(rechargeValid(150, 100, 30_000)).toBe(false);
    expect(rechargeValid(100, 200, 30_000)).toBe(false);
    expect(rechargeValid(30_100, 200, 30_000)).toBe(false);
  });
});

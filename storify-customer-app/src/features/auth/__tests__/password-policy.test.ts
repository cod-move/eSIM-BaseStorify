import type { PasswordPolicy } from '@/contracts/mobile/shop/v1';

import { checkPassword, meetsPolicy } from '../password-policy';

const lenient: PasswordPolicy = {
  minLength: 8,
  maxLength: 20,
  requireUppercase: false,
  requireNumber: false,
  requireSpecialCharacter: false,
};
const strict: PasswordPolicy = {
  ...lenient,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialCharacter: true,
};

describe('password rules', () => {
  it('lists only the rules the store has turned on, in the order they are shown', () => {
    expect(checkPassword('', lenient).map(({ rule }) => rule)).toEqual(['minLength']);
    expect(checkPassword('', strict).map(({ rule }) => rule)).toEqual([
      'minLength',
      'uppercase',
      'number',
      'special',
    ]);
  });

  it('ticks each rule as the password meets it', () => {
    expect(checkPassword('Sunflower', strict)).toEqual([
      { rule: 'minLength', met: true },
      { rule: 'uppercase', met: true },
      { rule: 'number', met: false },
      { rule: 'special', met: false },
    ]);
    expect(checkPassword('sun-7', strict)).toEqual([
      { rule: 'minLength', met: false },
      { rule: 'uppercase', met: false },
      { rule: 'number', met: true },
      { rule: 'special', met: true },
    ]);
  });

  it('counts a symbol as anything that is neither a letter nor a digit, as the store does', () => {
    const special = (password: string) =>
      checkPassword(password, { ...lenient, requireSpecialCharacter: true }).find(
        ({ rule }) => rule === 'special'
      )?.met;

    expect(special('pass word')).toBe(true);
    expect(special('päss')).toBe(true);
    expect(special('password1')).toBe(false);
  });

  it('shows the longest length only once it is broken', () => {
    expect(checkPassword('x'.repeat(20), lenient)).toEqual([{ rule: 'minLength', met: true }]);
    expect(checkPassword('x'.repeat(21), lenient)).toEqual([
      { rule: 'minLength', met: true },
      { rule: 'maxLength', met: false },
    ]);
  });

  it('accepts a password that meets every rule, and any password while no rules are known', () => {
    expect(meetsPolicy('Sunflower-7', strict)).toBe(true);
    expect(meetsPolicy('sunflower', strict)).toBe(false);
    expect(meetsPolicy('x', null)).toBe(true);
  });
});

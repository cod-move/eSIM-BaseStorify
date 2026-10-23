import { passwordRules } from '../password-rules';

const policy = {
  minLength: 8,
  maxLength: 128,
  requireUppercase: true,
  requireNumber: true,
  requireSpecialCharacter: true,
};

const unmet = (password: string) =>
  passwordRules(policy, password)
    .filter((rule) => !rule.met)
    .map((rule) => rule.kind);

describe("the store's password rules", () => {
  it('lists only the rules the store has switched on', () => {
    const rules = passwordRules(
      { ...policy, requireUppercase: false, requireSpecialCharacter: false },
      ''
    );
    expect(rules.map((rule) => rule.kind)).toEqual(['minLength', 'number']);
  });

  it('ticks each rule as the store judges it', () => {
    expect(unmet('')).toEqual(['minLength', 'uppercase', 'number', 'special']);
    expect(unmet('password')).toEqual(['uppercase', 'number', 'special']);
    expect(unmet('Password1!')).toEqual([]);
    // The store's tests are ASCII: an accented capital is not "A–Z", a letter outside A–Z is a symbol.
    expect(unmet('Écoute99')).toEqual(['uppercase']);
  });

  it('shows the longest a password may be only once it is broken', () => {
    expect(passwordRules(policy, 'Aa1!'.repeat(33)).map((rule) => rule.kind)).toContain(
      'maxLength'
    );
    expect(passwordRules(policy, 'Aa1!').map((rule) => rule.kind)).not.toContain('maxLength');
  });

  it('has nothing to show before the store has said its rules', () => {
    expect(passwordRules(undefined, 'anything')).toEqual([]);
  });
});

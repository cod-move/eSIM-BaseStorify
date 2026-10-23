import { initialsOf } from '../avatar';

describe('initials', () => {
  it('takes the first letters of the first and last names', () => {
    expect(initialsOf('Amina Rahman')).toBe('AR');
    expect(initialsOf('  nadia  ')).toBe('N');
    expect(initialsOf('Farhan Ali Kabir')).toBe('FK');
    expect(initialsOf('')).toBe('');
  });

  it('takes whole letters, not halves of them', () => {
    expect(initialsOf('😀 Smile')).toBe('😀S');
  });
});

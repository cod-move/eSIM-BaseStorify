import type { Me } from '@/contracts/mobile/shop/v1';

import { profileChanges, profileErrors, profileValues } from '../profile-changes';

const ME: Me = {
  id: 'u1',
  name: 'Nadia',
  email: 'nadia@example.com',
  emailVerified: true,
  phone: '+880 1712 345678',
  birthday: '1994-03-12',
  gender: 'female',
};
const TODAY = new Date('2026-10-02T00:00:00Z');

describe('profile changes', () => {
  it('sends nothing when nothing changed', () => {
    expect(profileChanges(ME, profileValues(ME))).toEqual({});
  });

  it('sends only what changed, trimmed, and null for an emptied field', () => {
    const values = {
      ...profileValues(ME),
      name: '  Nadia Rahman ',
      phone: ' ',
      gender: '' as const,
    };
    expect(profileChanges(ME, values)).toEqual({ name: 'Nadia Rahman', phone: null, gender: null });
  });

  it('sends a field the profile did not have', () => {
    const bare: Me = { id: 'u1', name: 'Nadia', email: 'n@e.co', emailVerified: true };
    expect(profileValues(bare)).toEqual({ name: 'Nadia', phone: '', birthday: '', gender: '' });
    expect(profileChanges(bare, { ...profileValues(bare), birthday: '2000-02-29' })).toEqual({
      birthday: '2000-02-29',
    });
  });

  it('refuses what the store would, and a birthday that is no past day', () => {
    expect(profileErrors({ name: 'N' }, TODAY)).toEqual(['name']);
    expect(profileErrors({ phone: 'x'.repeat(41) }, TODAY)).toEqual(['phone']);
    expect(profileErrors({ birthday: '12/03/1994' }, TODAY)).toEqual(['birthday']);
    expect(profileErrors({ birthday: '2001-02-29' }, TODAY)).toEqual(['birthday']);
    expect(profileErrors({ birthday: '2030-01-01' }, TODAY)).toEqual(['birthday']);
    expect(profileErrors({ birthday: '2000-02-29', phone: null }, TODAY)).toEqual([]);
  });
});

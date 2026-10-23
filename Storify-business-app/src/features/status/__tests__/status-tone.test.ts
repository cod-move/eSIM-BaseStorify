import en from '@/i18n/messages/en.json';

import { knownStatus, STATUS_TONES, statusTone, storeWord } from '../status-tone';

describe('status tones', () => {
  it('gives every status the table knows a word in en.json', () => {
    for (const [kind, statuses] of Object.entries(STATUS_TONES)) {
      const words = (en.status as Record<string, Record<string, string>>)[kind] ?? {};
      expect([kind, Object.keys(words).sort()]).toEqual([kind, Object.keys(statuses).sort()]);
    }
  });

  it('keeps red for what went wrong: a cancelled order asks nothing of the operator', () => {
    expect(statusTone('order', 'cancelled')).toBe('neutral');
    expect(statusTone('order', 'pending')).toBe('warning');
    expect(statusTone('order', 'delivered')).toBe('success');
    expect(statusTone('payment', 'expired')).toBe('danger');
  });

  it('reads the store’s spelling, and a status it does not know as neutral', () => {
    expect(knownStatus('order', 'Canceled')).toBe('cancelled');
    expect(knownStatus('payment', 'partially-paid')).toBe('partially_paid');
    expect(statusTone('order', 'on_hold')).toBe('neutral');
    expect(knownStatus('order', 'on_hold')).toBeNull();
    expect(storeWord('on_hold')).toBe('On hold');
  });
});

import { ESIM_PUSH_ASK_EVERY_MS, esimPushDue } from '../esim-push-moment';

describe('esimPushDue', () => {
  const now = 1_800_000_000_000;

  it('offers when never offered, or the stored time is unreadable', () => {
    expect(esimPushDue(null, now)).toBe(true);
    expect(esimPushDue('', now)).toBe(true);
    expect(esimPushDue('soon', now)).toBe(true);
  });

  it('waits the interval before offering again', () => {
    expect(esimPushDue(String(now - ESIM_PUSH_ASK_EVERY_MS + 1), now)).toBe(false);
    expect(esimPushDue(String(now - ESIM_PUSH_ASK_EVERY_MS), now)).toBe(true);
  });
});

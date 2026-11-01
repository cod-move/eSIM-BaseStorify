import { addDays, daysBetween } from '../start-date';

describe('start date', () => {
  it('steps over month and year ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-11-10', 0)).toBe('2026-11-10');
  });

  it('counts the days between two dates', () => {
    expect(daysBetween('2026-10-30', '2027-04-27')).toBe(179);
    expect(daysBetween('2026-11-10', '2026-11-10')).toBe(0);
  });
});

import { compareVersions } from '../version';

describe('compareVersions', () => {
  it('compares number by number, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.2.3', '1.2.10')).toBeLessThan(0);
  });

  it('treats a missing part as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('2', '1.9.9')).toBeGreaterThan(0);
  });

  it('ignores what follows the number in a part', () => {
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBe(0);
  });
});

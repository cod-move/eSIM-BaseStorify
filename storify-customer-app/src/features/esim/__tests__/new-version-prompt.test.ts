import { offersNewVersion } from '../new-version-prompt';

const NOW = 1_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('offersNewVersion', () => {
  it('offers the latest version to an app on the minimum version', () => {
    expect(
      offersNewVersion({ minVersion: '1.0.6', latestVersion: '1.0.7' }, '1.0.6', null, NOW)
    ).toBe(true);
  });

  it('offers it with no minimum set', () => {
    expect(offersNewVersion({ latestVersion: '1.1' }, '1.0.9', null, NOW)).toBe(true);
  });

  it('stays quiet on the latest version or newer, or with no latest set', () => {
    expect(offersNewVersion({ latestVersion: '1.0.7' }, '1.0.7', null, NOW)).toBe(false);
    expect(offersNewVersion({ latestVersion: '1.0.7' }, '1.0.10', null, NOW)).toBe(false);
    expect(offersNewVersion({ minVersion: '1.0.0' }, '1.0.0', null, NOW)).toBe(false);
    expect(offersNewVersion(undefined, '1.0.0', null, NOW)).toBe(false);
  });

  it('leaves an app below the minimum to the update-required prompt', () => {
    expect(
      offersNewVersion({ minVersion: '1.0.6', latestVersion: '1.0.7' }, '1.0.5', null, NOW)
    ).toBe(false);
  });

  it('keeps away for three days after "later", for that version only', () => {
    const release = { latestVersion: '1.0.7' };
    expect(offersNewVersion(release, '1.0.6', { version: '1.0.7', at: NOW - DAY }, NOW)).toBe(
      false
    );
    expect(offersNewVersion(release, '1.0.6', { version: '1.0.7', at: NOW - 4 * DAY }, NOW)).toBe(
      true
    );
    expect(offersNewVersion(release, '1.0.6', { version: '1.0.6', at: NOW - DAY }, NOW)).toBe(true);
  });
});

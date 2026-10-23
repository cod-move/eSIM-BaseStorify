import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';

import { applyDirection } from '../direction';

/** What the phone reports for the layout: fixed at start, so a test sets it as a restart would. */
function layoutIs(direction: 'ltr' | 'rtl') {
  jest.replaceProperty(I18nManager, 'isRTL', direction === 'rtl');
}

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => {});
  jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => {});
  layoutIs('ltr');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('applyDirection', () => {
  it('leaves the app alone when the layout already runs the way of the language', () => {
    expect(applyDirection('en')).toBe(false);
    expect(reloadAppAsync).not.toHaveBeenCalled();
  });

  it('restarts the app when the language runs the other way', () => {
    expect(applyDirection('ar')).toBe(true);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('does not restart again when the restart did not change the direction', () => {
    expect(applyDirection('ar')).toBe(true);

    // The app is back, and the layout still runs left to right.
    expect(applyDirection('ar')).toBe(false);
    expect(reloadAppAsync).toHaveBeenCalledTimes(1);
  });

  it('restarts for the next change after one that worked', () => {
    expect(applyDirection('ar')).toBe(true);

    layoutIs('rtl');
    expect(applyDirection('ar')).toBe(false);

    expect(applyDirection('en')).toBe(true);
    expect(I18nManager.forceRTL).toHaveBeenLastCalledWith(false);
    expect(reloadAppAsync).toHaveBeenCalledTimes(2);
  });
});

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { ScrollView } from 'react-native';

import { openApp } from '@/__tests__/helpers';

/** The tab bar's second tap, on the mock store: the open page at the tab's root is asked to scroll to its top. */
describe('tab bar, a tap on the active tab', () => {
  it('asks the page at the tab root to scroll to the top', async () => {
    // The scroll target: every scroll view's `scrollTo` is the test renderer's mock.
    const scrollTo = ScrollView.prototype.scrollTo as jest.Mock;
    scrollTo.mockClear();

    await openApp('/');
    const home = await screen.findByRole('tab', { name: 'Home' });
    expect(home.props.accessibilityState.selected).toBe(true);

    // Home loads its page first; a tap before it has mounted has no page to ask, so it is repeated.
    await waitFor(async () => {
      await fireEvent.press(screen.getByRole('tab', { name: 'Home' }));
      expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
    });
  });
});

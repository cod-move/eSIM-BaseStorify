import { fireEvent, screen } from 'expo-router/testing-library';

import { openApp } from '@/__tests__/helpers';

/** The tab bar of the app, on the mock store. */
describe('tab bar', () => {
  it('switches tabs, and the screen follows', async () => {
    const app = await openApp('/');

    const search = await screen.findByRole('tab', { name: 'Search' });
    expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState.selected).toBe(true);

    await fireEvent.press(search);

    expect(app.pathname()).toBe('/search');
    expect(screen.getByRole('tab', { name: 'Search' }).props.accessibilityState.selected).toBe(
      true
    );
    expect(screen.getByRole('tab', { name: 'Home' }).props.accessibilityState.selected).toBe(false);

    await fireEvent.press(screen.getByRole('tab', { name: 'Account' }));
    expect(app.pathname()).toBe('/account');
  });
});

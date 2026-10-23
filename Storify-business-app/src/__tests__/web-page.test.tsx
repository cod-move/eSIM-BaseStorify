import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import './hooks';
import './preload-app';
import { currentPath, openApp, settle, signIn, signInOnScreen, tap } from './screens';

/** The web page on screen, as the app set it up. */
function page() {
  const view = screen.getAllByTestId('web-page').at(-1);
  if (!view) throw new Error('No web page on screen');
  return view.props as {
    source: { uri: string };
    incognito?: boolean;
    onShouldStartLoadWithRequest: (request: { url: string }) => boolean;
  };
}

async function openPage(url: string): Promise<void> {
  await act(async () => router.push({ pathname: '/web', params: { url } }));
  await settle();
}

/** Web pages open inside the app: the operator never leaves it for a browser. */
describe('a web page, inside the app', () => {
  it('follows a parcel on the carrier’s page', async () => {
    await signIn();
    await act(async () => router.push({ pathname: '/orders/[id]', params: { id: 'ord_1037' } }));
    await settle();
    await tap(await screen.findByRole('button', { name: 'Follow the parcel' }));
    await settle();

    expect(currentPath()).toBe('/web');
    expect(screen.getByRole('header', { name: 'Follow the parcel' })).toBeVisible();
    expect(page().source.uri).toBe('https://example.com/track/PTH-88412');
  });

  it('opens the store’s dashboard under the store’s name, keeping nothing after', async () => {
    await openApp();
    await signInOnScreen('unpaid-seller@example.com');
    await tap(await screen.findByRole('link', { name: 'Open the website' }));
    await settle();

    expect(screen.getByRole('header', { name: 'Storify Demo Store' })).toBeVisible();
    expect(page().source.uri).toBe('https://mock.storify.invalid/en/login');
    // A sign-in to the website made here does not outlive the page.
    expect(page().incognito).toBe(true);
  });

  it('keeps web links in the page, and hands mail and phone links to the phone', async () => {
    await signIn();
    await openPage('https://example.com/help');
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    try {
      expect(screen.getByRole('header', { name: 'example.com' })).toBeVisible();
      expect(page().onShouldStartLoadWithRequest({ url: 'https://example.com/next' })).toBe(true);
      expect(page().onShouldStartLoadWithRequest({ url: 'mailto:help@example.com' })).toBe(false);
      expect(page().onShouldStartLoadWithRequest({ url: 'tel:+8801711000006' })).toBe(false);
      expect(openURL.mock.calls).toEqual([['mailto:help@example.com'], ['tel:+8801711000006']]);
    } finally {
      openURL.mockRestore();
    }
  });

  it('opens nothing but a web address', async () => {
    await signIn();
    await openPage('javascript:alert(1)');

    expect(screen.getByText("This page can't be opened")).toBeVisible();
    expect(screen.queryByTestId('web-page')).toBeNull();
  });
});

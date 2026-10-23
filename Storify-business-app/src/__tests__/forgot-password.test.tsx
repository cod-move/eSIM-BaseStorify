import { screen } from '@testing-library/react-native';

import { sentResetLinks } from '@/api/mocks/routes/auth';

import './hooks';
import './preload-app';
import { currentPath, openApp, press, settle, tap, type, wait } from './screens';

/** From sign-in, with what the operator typed there, to "Forgot your password?". */
async function openForgotPassword(email = ''): Promise<void> {
  await openApp();
  await screen.findByRole('button', { name: 'Sign in' });
  if (email) await type('Email', email);
  await tap(screen.getByRole('link', { name: 'Forgot password?' }));
  await settle();
  await screen.findByRole('header', { name: 'Forgot your password?' });
}

// The app's first render can take longer than Jest's default 5 seconds under a
// full parallel run.
jest.setTimeout(20_000);

/**
 * Lets the minute before another link pass. The countdown's next tick is set
 * after the screen draws, outside the first wait: the second one lets it run.
 */
async function waitAMinute(): Promise<void> {
  await wait(60_000);
  await wait(1000);
}

/** A forgotten password, asked for in the app. */
describe('a forgotten password', () => {
  it('sends a reset link to the address typed on sign-in, without leaving the app', async () => {
    await openForgotPassword('admin@example.com');
    expect(currentPath()).toBe('/forgot-password');

    await press('Send link');
    await settle();

    expect(await screen.findByRole('header', { name: 'Check your email' })).toBeVisible();
    expect(screen.getByText('admin@example.com')).toBeVisible();
    expect(sentResetLinks()).toEqual(['admin@example.com']);

    // Asking again waits a minute.
    expect(screen.getByRole('link', { name: 'Send a new link in 60 seconds' })).toBeDisabled();
    await waitAMinute();
    await tap(screen.getByRole('link', { name: 'Send a new link' }));
    await settle();
    expect(sentResetLinks()).toEqual(['admin@example.com', 'admin@example.com']);

    await press('Back to sign in');
    await settle();
    expect(currentPath()).toBe('/sign-in');
  });

  it('says the same for an address with no account, and sends nothing', async () => {
    await openForgotPassword();
    await type('Email', 'nobody@example.com');
    await press('Send link');
    await settle();

    expect(await screen.findByRole('header', { name: 'Check your email' })).toBeVisible();
    expect(sentResetLinks()).toEqual([]);
  });

  it('asks for an address, and for one that is an address', async () => {
    await openForgotPassword();
    await press('Send link');
    expect(screen.getByText('Enter your email address.')).toBeVisible();

    await type('Email', 'admin');
    await press('Send link');
    await settle();
    expect(screen.getByText('Please enter a valid email address.')).toBeVisible();
    expect(sentResetLinks()).toEqual([]);
  });

  it('says how long to wait once the store has sent enough links', async () => {
    await openForgotPassword('admin@example.com');
    await press('Send link');
    await settle();
    for (let resent = 0; resent < 4; resent++) {
      await waitAMinute();
      await tap(screen.getByRole('link', { name: 'Send a new link' }));
      await settle();
    }
    expect(sentResetLinks()).toHaveLength(5);

    await waitAMinute();
    await tap(screen.getByRole('link', { name: 'Send a new link' }));
    await settle();

    expect(screen.getByText('Too many attempts. Wait 10 minutes, then try again.')).toBeVisible();
    expect(sentResetLinks()).toHaveLength(5);
  });
});

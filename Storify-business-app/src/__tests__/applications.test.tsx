import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as applicationEndpoints from '@/api/endpoints/vendor-applications';
import { decideVendorApplication } from '@/api/endpoints/vendor-applications';
import { dropNextRequest, loseNextAnswer } from '@/api/mocks/server';

import './hooks';
import './preload-app';
import { openTab, press, settle, signIn, signInOnScreen, tap, type, wait } from './screens';

async function openApplications(): Promise<void> {
  await signIn();
  await openTab('Account');
  await press('Seller applications');
  await settle();
  await screen.findByRole('header', { name: 'Seller applications' });
}

async function openApplication(id: string, name: string): Promise<void> {
  await signIn();
  await act(async () => router.push({ pathname: '/applications/[id]', params: { id } }));
  await settle();
  await screen.findByRole('header', { name });
}

/** The shops the list shows, by name. */
function listed(): string[] {
  const shops = [
    'Sunrise Bakery',
    'Pixel Prints',
    'Clay & Kiln',
    'Green Leaf Goods',
    'Blue Harbor Crafts',
    'Quick Gadgets',
  ];
  return screen
    .getAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel ?? '').split(',')[0]!)
    .filter((name) => shops.includes(name));
}

/** Signs out from Account, as the operator would: the button, then the sheet's. */
async function signOut(): Promise<void> {
  await act(async () => router.push('/more/account'));
  await settle();
  await press('Sign out');
  await press('Sign out');
  await settle();
  await screen.findByRole('button', { name: 'Sign in' });
}

/** The address of the web page the app opened last, inside the app. */
function lastOpened(): string {
  const source = screen.getAllByTestId('web-page').at(-1)?.props.source as { uri?: string };
  return source?.uri ?? '';
}

/** Sellers' applications, for administrators. */
describe('the applications', () => {
  it('lists those waiting for a decision, the one waiting longest first', async () => {
    await openApplications();

    expect(listed()).toEqual(['Pixel Prints', 'Sunrise Bakery']);
    expect(
      screen.getByRole('button', { name: /^Pixel Prints, Rashed Khan, Pending, Applied .* · Pro$/ })
    ).toBeVisible();
  });

  it('shows the decided ones on their tabs, and finds a shop by its name', async () => {
    await openApplications();

    await tap(screen.getByRole('tab', { name: 'Approved' }));
    await settle();
    expect(listed()).toEqual(['Blue Harbor Crafts', 'Green Leaf Goods']);

    await tap(screen.getByRole('tab', { name: 'Rejected' }));
    await settle();
    expect(listed()).toEqual(['Quick Gadgets']);

    await tap(screen.getByRole('tab', { name: 'All' }));
    await type('Shop name', 'kiln');
    await wait(400);
    await settle();
    expect(listed()).toEqual(['Clay & Kiln']);
    expect(
      screen.getByRole('button', { name: /^Clay & Kiln, Nabila Haque, Not submitted/ })
    ).toBeVisible();
  });

  it('reads the list again on coming back to it: one decided meanwhile has left the pending tab', async () => {
    await openApplications();
    expect(listed()).toEqual(['Pixel Prints', 'Sunrise Bakery']);

    await tap(screen.getByRole('button', { name: /^Pixel Prints,/ }));
    await settle();
    await screen.findByRole('header', { name: 'Pixel Prints' });
    // Another administrator decides on Sunrise Bakery meanwhile, on the website.
    await act(async () => {
      await decideVendorApplication(
        { locale: 'en', workspace: 'platform' },
        'vendor_sunrise',
        { decision: 'reject', reason: 'Not now.' },
        'somebody-else'
      );
    });

    await act(async () => router.back());
    await settle();
    expect(listed()).toEqual(['Pixel Prints']);
  });
});

describe('an application', () => {
  it('shows the applicant, the answers in the app’s own words, and the documents', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    for (const fact of [
      'Name, Ayesha Siddika',
      'Email, ayesha@sunrise.example',
      'Address, 22 Baker Lane, Dhaka, BD',
      'Tax number, TIN-4419-2201',
      'How many products will you list?, 25',
      'Do you ship nationwide?, No',
    ]) {
      expect(screen.getByLabelText(fact)).toBeVisible();
    }
    expect(screen.getByRole('link', { name: 'Open Business licence' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Government ID' })).toBeVisible();
    // A document the store asked for itself goes by its own question.
    expect(screen.getByRole('link', { name: 'Open Food safety permit' })).toBeVisible();
  });

  it('opens a document through its link, and asks for a new link once it has run out', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    await tap(screen.getByRole('link', { name: 'Open Business licence' }));
    await settle();
    // In the app, under the document's name.
    expect(screen.getByRole('header', { name: 'Business licence' })).toBeVisible();
    const first = lastOpened();
    expect(first).toMatch(/\/documents\/vendor_sunrise\/0\.pdf\?expires=/);
    await act(async () => router.back());
    await settle();

    // Six minutes later the five-minute link has run out: the application is read again first.
    jest.setSystemTime(Date.now() + 6 * 60_000);
    await tap(screen.getByRole('link', { name: 'Open Business licence' }));
    await settle();
    const fresh = lastOpened();
    expect(fresh).toMatch(/\/documents\/vendor_sunrise\/0\.pdf\?expires=/);
    expect(fresh).not.toBe(first);
  });

  it('says so when a document whose link ran out is no longer on the application', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');
    const original = applicationEndpoints.getVendorApplication;
    const read = jest
      .spyOn(applicationEndpoints, 'getVendorApplication')
      .mockImplementation(async (...args) => ({ ...(await original(...args)), documents: [] }));

    // The link has run out, and the application read again has no documents now.
    jest.setSystemTime(Date.now() + 6 * 60_000);
    await tap(screen.getByRole('link', { name: 'Open Business licence' }));
    await settle();
    expect(screen.getByText('This document is no longer on the application.')).toBeOnTheScreen();
    expect(screen.queryAllByTestId('web-page')).toHaveLength(0);
    read.mockRestore();
  });

  it('approves after asking, and says what the store did', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    await press('Approve');
    // A sheet's own motion does not run here: it is on the screen, not yet faded in.
    expect(await screen.findByText('Approve Sunrise Bakery?')).toBeOnTheScreen();
    await press('Approve');
    await settle();

    expect(await screen.findByText('Approved. Sunrise Bakery is open.')).toBeVisible();
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });

  it('says a free trial has started, when the plan has one', async () => {
    await openApplication('vendor_pixel', 'Pixel Prints');

    await press('Approve');
    await press('Approve');
    await settle();

    expect(
      await screen.findByText("Approved. Pixel Prints's free trial has started.")
    ).toBeVisible();
  });

  it('decides once though the first answer was lost: the retry carries the same key', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    loseNextAnswer();
    await press('Approve');
    await press('Approve');
    await settle();
    // Carried out, its answer lost: tried again in a moment with the same key, which the store replays.
    await wait(1000);
    await settle();

    expect(await screen.findByText('Approved. Sunrise Bakery is open.')).toBeVisible();
  });

  it('a decision still being sent when its operator signs out: it stops, and nothing is said', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    // The first try never reaches the store; the next would go a second later.
    dropNextRequest(2, { method: 'POST', path: /\/decision$/ });
    await press('Approve');
    await press('Approve');
    await settle();
    await signOut();

    // Past the time of every try: the sign-in screen says nothing of it.
    await wait(1500);
    expect(
      screen.queryByText('Something went wrong on our end. Please try again later.')
    ).toBeNull();
    await wait(2500);

    // Nothing was decided: it still waits for a decision.
    await signInOnScreen('admin@example.com');
    await screen.findByRole('tab', { name: 'Home' });
    await act(async () =>
      router.push({ pathname: '/applications/[id]', params: { id: 'vendor_sunrise' } })
    );
    await settle();
    expect(await screen.findByRole('button', { name: 'Approve' })).toBeVisible();
  });

  it('rejects only with a reason, which the applicant reads', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    await press('Reject');
    expect(await screen.findByText('Reject Sunrise Bakery?')).toBeOnTheScreen();
    const confirm = () => screen.getAllByRole('button', { name: 'Reject' }).at(-1)!;
    expect(confirm()).toBeDisabled();

    await type('Reason, which the applicant reads', 'The licence has expired.');
    expect(confirm()).toBeEnabled();
    await tap(confirm());
    await settle();

    expect(
      await screen.findByText('Application rejected. The applicant has been told.')
    ).toBeVisible();
    expect(screen.getByLabelText('Reason, The licence has expired.')).toBeVisible();
  });

  it('keeps a reason longer than the store takes in the sheet, to shorten it', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    await press('Reject');
    await type('Reason, which the applicant reads', 'x'.repeat(1001));
    await tap(screen.getAllByRole('button', { name: 'Reject' }).at(-1)!);
    await settle();

    expect(await screen.findByText('Keep the reason to 1,000 characters or fewer.')).toBeVisible();
    // Nothing was sent: the sheet is there with the words.
    expect(screen.getByText('Reject Sunrise Bakery?')).toBeOnTheScreen();
    expect(screen.getByLabelText('Reason, which the applicant reads').props.value).toHaveLength(
      1001
    );
    expect(screen.queryByText('Application rejected. The applicant has been told.')).toBeNull();
  });

  it('shows the application as it now is when it was decided first', async () => {
    await openApplication('vendor_sunrise', 'Sunrise Bakery');

    // Another administrator, on the website or another phone, approves it meanwhile.
    await act(async () => {
      await decideVendorApplication(
        { locale: 'en', workspace: 'platform' },
        'vendor_sunrise',
        { decision: 'reject', reason: 'Not now.' },
        'somebody-else'
      );
    });

    await press('Approve');
    await press('Approve');
    await settle();

    expect(
      await screen.findByText('This application has already been decided. Here it is as it is now.')
    ).toBeVisible();
    expect(await screen.findByLabelText('Reason, Not now.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('offers no decision on one the applicant has not finished', async () => {
    await openApplication('vendor_draft', 'Clay & Kiln');

    expect(screen.getAllByText('Not submitted').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });
});

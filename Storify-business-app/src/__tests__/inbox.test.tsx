import { focusManager, onlineManager } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as inboxEndpoints from '@/api/endpoints/inbox';
import { ApiError } from '@/api/errors';
import { receiveMockMessage, refuseNextReply, setMockReplyWindow } from '@/api/mocks/routes/inbox';
import { dropNextRequest, loseNextAnswer } from '@/api/mocks/server';
import { queryClient } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import type { Me } from '@/contracts/mobile/biz/v1';
import { selectUploadFile } from '@/features/uploads/select-file';
import { selectedUploadFile } from '@/features/uploads/selected-file';
import { useWorkspaceStore } from '@/features/workspace/workspace-store';

import './hooks';
import './preload-app';
import {
  currentPath,
  openTab,
  press,
  pullToRefresh,
  settle,
  signIn,
  signInOnScreen,
  tabNames,
  tap,
  type,
  wait,
} from './screens';

jest.mock('@/features/uploads/select-file', () => ({ selectUploadFile: jest.fn() }));

// Several tests sign in, switch workspace and read threads; under a full
// parallel run that takes longer than Jest's default 5 seconds.
jest.setTimeout(20_000);

const DASHBOARD = 'https://mock.storify.invalid/en/login';

/** The address of the web page the app opened last, inside the app. */
function openedPage(): string {
  const source = screen.getAllByTestId('web-page').at(-1)?.props.source as { uri?: string };
  return source?.uri ?? '';
}

async function openInbox(email: string): Promise<void> {
  await signIn(email);
  await openTab('Inbox');
  await screen.findByRole('header', { name: 'Inbox' });
  await settle();
}

async function openThread(email: string, id: string): Promise<void> {
  await signIn(email);
  await showThread(id);
}

async function showThread(id: string): Promise<void> {
  await act(async () => router.push({ pathname: '/conversations/[id]', params: { id } }));
  await settle();
}

/** A reply's three tries: at once, a second later, two more after that. */
async function throughRetries(): Promise<void> {
  await settle();
  await wait(1000);
  await wait(2000);
  await settle();
}

/** Back to the inbox, read again from the store: what it holds now, not what the app has. */
async function inboxAsStored(): Promise<void> {
  await act(async () => router.back());
  await settle();
  await openTab('Inbox');
  await pullToRefresh();
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

/** Switches workspace from Home's header, as the operator would (both@example.com: staff in each). */
async function switchTo(name: string): Promise<void> {
  await act(async () => router.navigate('/'));
  await settle();
  await press(
    name === 'Green Leaf Goods' ? 'Storify Demo Store, Staff' : 'Green Leaf Goods, Staff'
  );
  await settle();
  const choices = screen.getAllByRole('radio', { name });
  await tap(choices[choices.length - 1]!);
  await settle();
  await screen.findByRole('button', { name: `${name}, Staff` });
}

/** The conversations the inbox lists, by the customer's name (their rows' names start with it). */
function listed(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => String(button.props.accessibilityLabel ?? ''))
    .filter((label) =>
      /^(Rina Begum|Jamal Uddin|Mehedi Hasan|Omar Faruk|Shirin Akter),/.test(label)
    )
    .map((label) => label.split(',')[0]!);
}

/** The Inbox tab: the workspace's conversations with customers. */
describe('the inbox', () => {
  it('lists the store’s conversations, the newest first, with their unread messages', async () => {
    await openInbox('admin@example.com');

    expect(listed()).toEqual(['Rina Begum', 'Jamal Uddin', 'Mehedi Hasan']);
    expect(
      screen.getByRole('button', { name: /^Rina Begum, 2 unread messages, Ceramic bud vase/ })
    ).toBeVisible();
    // The channel is said when it is not the store's own live chat; a closed one says so.
    expect(screen.getByText('WhatsApp · It ships today, you will get a text.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: /^Mehedi Hasan, Wholesale enquiry, Closed, / })
    ).toBeVisible();
    expect(tabNames()).toContain('Inbox, 2 unread');
  });

  it('lists a seller’s own conversations only', async () => {
    await openInbox('seller@example.com');

    expect(listed()).toEqual(['Omar Faruk', 'Shirin Akter']);
  });

  it('shows the unread ones, and finds one by the customer', async () => {
    await openInbox('admin@example.com');

    await tap(screen.getByRole('button', { name: 'Filter conversations' }));
    await wait(400);
    await tap(screen.getByRole('radio', { name: 'Unread' }));
    await press('Apply');
    await wait(400);
    await settle();
    expect(listed()).toEqual(['Rina Begum']);
    expect(screen.getByText('Showing: Unread')).toBeVisible();

    await tap(screen.getByRole('link', { name: 'Clear' }));
    await type('Name, email, phone or subject', 'jamal');
    await wait(400);
    await settle();
    expect(listed()).toEqual(['Jamal Uddin']);

    await type('Name, email, phone or subject', 'nobody at all');
    await wait(400);
    await settle();
    expect(await screen.findByText('No conversation matches “nobody at all”.')).toBeVisible();
  });

  it('opens a conversation, which marks it read: the badge follows', async () => {
    await openInbox('admin@example.com');

    await tap(screen.getByRole('button', { name: /^Rina Begum,/ }));
    await settle();
    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
    await settle();

    await act(async () => router.back());
    await settle();
    expect(screen.getByRole('button', { name: /^Rina Begum, Ceramic bud vase/ })).toBeVisible();
    expect(tabNames()).toContain('Inbox');
  });
  it('is read again on coming back to the app, the badge with it, but not on a timer', async () => {
    await openInbox('admin@example.com');
    expect(tabNames()).toContain('Inbox, 2 unread');
    receiveMockMessage('conv_store_1', 'Is the blue one in stock too?');

    // A minute in front: no timer reads it.
    await wait(60_000);
    expect(screen.queryByText('Is the blue one in stock too?')).toBeNull();

    // The app goes away and comes back, as after a push it never heard.
    try {
      await act(async () => {
        focusManager.setFocused(false);
        focusManager.setFocused(true);
      });
      await settle();
      expect(await screen.findByText('Is the blue one in stock too?')).toBeVisible();
      expect(tabNames()).toContain('Inbox, 3 unread');
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it('is read again on a pull', async () => {
    await openInbox('admin@example.com');
    receiveMockMessage('conv_store_1', 'Is the blue one in stock too?');

    await pullToRefresh();
    expect(await screen.findByText('Is the blue one in stock too?')).toBeVisible();
  });
});

/** A conversation: what it is about, its messages, and the reply. */
describe('a conversation', () => {
  it('shows what it is about, the team’s note apart, and opens a picture', async () => {
    await openThread('admin@example.com', 'conv_store_1');

    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
    expect(screen.getByText('Ceramic bud vase')).toBeVisible();
    expect(screen.getByText('Live chat · rina@example.com')).toBeVisible();
    expect(screen.getByText('Note · Amina Rahman')).toBeVisible();
    expect(screen.getByText('Offer free gift wrap if she orders two.')).toBeVisible();

    // Full screen, under its name, and back to the thread.
    await tap(screen.getByRole('imagebutton', { name: 'Open the picture' }));
    await settle();
    expect(currentPath()).toBe('/viewer');
    expect(screen.getByRole('header', { name: 'colour.jpg' })).toBeVisible();
    await press('Close');
    await settle();
    expect(currentPath()).toBe('/conversations/conv_store_1');
  });

  it('says when a team reply was not delivered, with the store’s reason', async () => {
    await openThread('seller@example.com', 'conv_green_2');

    expect(await screen.findByText(/· Not delivered$/)).toBeVisible();
    expect(
      screen.getByText('Messenger refused the message: the page token expired.')
    ).toBeVisible();
  });

  it('shows a reply at once, and the store’s answer settles it: once, though its first answer was lost', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });

    loseNextAnswer();
    await type('Reply to Rina Begum', 'Yes, we gift wrap for free.');
    await press('Send');

    // Carried out, its answer lost: the app tries again in a moment, with the same key.
    expect(await screen.findByText('Sending…')).toBeVisible();
    expect(screen.getByLabelText('Reply to Rina Begum').props.value).toBe('');
    await wait(1000);
    await settle();

    expect(screen.queryByText('Sending…')).toBeNull();
    expect(screen.getAllByText('Yes, we gift wrap for free.')).toHaveLength(1);

    // The store holds it once: the thread read again still shows one.
    await wait(4000);
    expect(screen.getAllByText('Yes, we gift wrap for free.')).toHaveLength(1);
  });

  it('keeps a reply that never reached the store as "not sent"; trying again sends it once', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    // No try reaches the store.
    dropNextRequest(3, { method: 'POST', path: /\/messages$/ });
    await type('Reply to Rina Begum', 'Two vases, then.');
    await press('Send');
    await throughRetries();

    expect(await screen.findByText('Not sent')).toBeVisible();
    expect(screen.getByText('Please check your internet connection and try again.')).toBeVisible();

    await tap(screen.getByRole('link', { name: 'Try again' }));
    await settle();

    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.getAllByText('Two vases, then.')).toHaveLength(1);
    // The thread read again: the store holds it once.
    await wait(4000);
    expect(screen.getAllByText('Two vases, then.')).toHaveLength(1);
  });

  it('a reply the store took though no answer came back: shown once, as the store holds it', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    // The first try is carried out; it and both tries again lose their answers.
    loseNextAnswer(3);
    await type('Reply to Rina Begum', 'Two vases, then.');
    await press('Send');
    await throughRetries();

    // The thread read again has the store's copy: no "not sent" one beside it.
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.getAllByText('Two vases, then.')).toHaveLength(1);
  });

  it('a reply that fails while the operator is elsewhere: a toast says so and opens the conversation', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    dropNextRequest(3, { method: 'POST', path: /\/messages$/ });
    await type('Reply to Rina Begum', 'Two vases, then.');
    await press('Send');
    await act(async () => router.back());
    await throughRetries();

    expect(await screen.findByText("Your reply to Rina Begum wasn't sent.")).toBeVisible();
    await press('Open');
    await settle();

    expect(await screen.findByRole('header', { name: 'Rina Begum' })).toBeVisible();
    expect(screen.getByText('Not sent')).toBeVisible();
    await tap(screen.getByRole('link', { name: 'Try again' }));
    await settle();
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.getAllByText('Two vases, then.')).toHaveLength(1);
  });

  it('the same words sent twice, the second never reaching the store: it stays "not sent" beside the first', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    // The first is stored, its answer lost: it is tried again a second later, and answered.
    loseNextAnswer();
    await type('Reply to Rina Begum', 'Hello?');
    await press('Send');
    await wait(500);
    // The second, sent meanwhile, never reaches the store: not its first try, nor its next two.
    dropNextRequest(1, { method: 'POST', path: /\/messages$/ });
    await type('Reply to Rina Begum', 'Hello?');
    await press('Send');
    await wait(600);
    dropNextRequest(2, { method: 'POST', path: /\/messages$/ });
    await wait(2500);
    await settle();

    // The first's stored copy is the first's: it does not stand for the second.
    expect(screen.getByText('Not sent')).toBeVisible();
    expect(screen.getAllByText('Hello?')).toHaveLength(2);

    await tap(screen.getByRole('link', { name: 'Try again' }));
    await settle();
    expect(screen.queryByText('Not sent')).toBeNull();
    await wait(4000);
    expect(screen.getAllByText('Hello?')).toHaveLength(2);
  });

  it('a reply still being sent when its operator signs out: it stops, and the next person hears nothing of it', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    // The first try never reaches the store; the next would go a second later.
    dropNextRequest(2, { method: 'POST', path: /\/messages$/ });
    await type('Reply to Rina Begum', 'Two vases, then.');
    await press('Send');
    await settle();
    await signOut();

    // Past the time of every try: the sign-in screen names no customer.
    await wait(1500);
    expect(screen.queryByText("Your reply to Rina Begum wasn't sent.")).toBeNull();
    await wait(2500);

    // The next person, who may reply there too: the reply was not sent as theirs, nor waits for them.
    await act(async () =>
      useWorkspaceStore.setState({ choice: { userId: 'user_both', workspace: 'platform' } })
    );
    await signInOnScreen('both@example.com');
    await screen.findByRole('tab', { name: 'Home' });
    expect(screen.queryByText("Your reply to Rina Begum wasn't sent.")).toBeNull();
    await showThread('conv_store_1');
    expect(await screen.findByLabelText('Reply to Rina Begum')).toBeOnTheScreen();
    expect(screen.queryByText('Two vases, then.')).toBeNull();
    expect(screen.queryByText('Not sent')).toBeNull();
  });

  it('a reply that fails after a switch of workspace: said, without a way to a conversation not there', async () => {
    useWorkspaceStore.setState({ choice: { userId: 'user_both', workspace: 'platform' } });
    await openThread('both@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    dropNextRequest(3, { method: 'POST', path: /\/messages$/ });
    await type('Reply to Rina Begum', 'Two vases, then.');
    await press('Send');
    await switchTo('Green Leaf Goods');
    await throughRetries();

    expect(await screen.findByText("Your reply to Rina Begum wasn't sent.")).toBeVisible();
    // In Green Leaf Goods the store's conversation would open as "not found".
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();

    // Back where it was sent, it waits in its conversation, to try again.
    await switchTo('Storify Demo Store');
    await showThread('conv_store_1');
    expect(await screen.findByText('Not sent')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Try again' })).toBeVisible();
  });

  it('a reply tried again gets its first answer replayed: the conversation in it is not put back', async () => {
    await signIn('seller@example.com');
    // WhatsApp's window, open for another minute.
    setMockReplyWindow('conv_green_2', new Date(Date.now() + 60_000).toISOString());
    await showThread('conv_green_2');
    await screen.findByRole('header', { name: 'Shirin Akter' });
    // Just before the thread is read again (every 4 seconds from when it opened).
    await wait(3400);

    // Stored, and the answer the store keeps for its key holds the window of a minute.
    loseNextAnswer();
    await type('Reply to Shirin Akter', 'They are unscented, yes.');
    await press('Send');
    // The customer writes: the window opens for a day. The thread is read again.
    setMockReplyWindow('conv_green_2', new Date(Date.now() + 24 * 60 * 60_000).toISOString());
    await wait(800);
    // Then the try again: the first answer, with its old window.
    await wait(500);
    await settle();

    // A minute on, the store's window is still open, so is the composer.
    await wait(60_000);
    expect(screen.getByLabelText('Reply to Shirin Akter')).toBeOnTheScreen();
    expect(screen.queryByText('The reply window has closed')).toBeNull();
    expect(screen.getAllByText('They are unscented, yes.')).toHaveLength(1);
  });

  it('sends nothing offline: the text stays, and a toast says so', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    onlineManager.setOnline(false);
    try {
      await type('Reply to Rina Begum', 'Back in a minute.');
      await press('Send');

      expect(await screen.findByText("You're offline. Nothing was sent.")).toBeVisible();
      expect(screen.getByLabelText('Reply to Rina Begum').props.value).toBe('Back in a minute.');
      expect(screen.queryByText('Sending…')).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it('reads the thread again while it is open, and marks the new message read', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    receiveMockMessage('conv_store_1', 'Is the blue one in stock too?');
    await wait(4000);
    expect(await screen.findByText('Is the blue one in stock too?')).toBeVisible();
    await settle();

    // The store's own word: the new message was marked read as well.
    await inboxAsStored();
    expect(screen.getByRole('button', { name: /^Rina Begum, Ceramic bud vase/ })).toBeVisible();
    expect(tabNames()).toContain('Inbox');
  });

  it('marks it read again at the next read when the first mark got no answer', async () => {
    await signIn('admin@example.com');
    dropNextRequest(1, { method: 'POST', path: /\/read$/ });
    await showThread('conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await settle();

    await wait(4000);
    await settle();

    await inboxAsStored();
    expect(screen.getByRole('button', { name: /^Rina Begum, Ceramic bud vase/ })).toBeVisible();
  });

  it('does not mark it read again when the store refused the mark', async () => {
    const mark = jest
      .spyOn(inboxEndpoints, 'markConversationRead')
      .mockRejectedValue(
        new ApiError(403, 'AUTHORIZATION_ERROR', 'You do not have permission to do this')
      );
    try {
      await openThread('admin@example.com', 'conv_store_1');
      await screen.findByRole('header', { name: 'Rina Begum' });
      await settle();
      expect(mark).toHaveBeenCalledTimes(1);

      // Read again three times: the refusal stands, and nothing more is sent.
      await wait(12_000);
      expect(mark).toHaveBeenCalledTimes(1);
    } finally {
      mark.mockRestore();
    }
  });
});

describe('unsent reply drafts', () => {
  it('recovers text after navigation and keeps each thread separate', async () => {
    await openThread('seller@example.com', 'conv_green_1');
    await type('Reply to Omar Faruk', 'I will check the address.');
    await showThread('conv_green_2');
    expect(await screen.findByLabelText('Reply to Shirin Akter')).toHaveProp('value', '');
    await act(async () => router.back());
    await settle();
    expect(await screen.findByLabelText('Reply to Omar Faruk')).toHaveProp(
      'value',
      'I will check the address.'
    );
  });

  it('forgets drafts on sign-out, including a later sign-in by the same person', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await type('Reply to Rina Begum', 'Private unfinished reply.');
    await signOut();
    await signInOnScreen('admin@example.com');
    await showThread('conv_store_1');
    expect(await screen.findByLabelText('Reply to Rina Begum')).toHaveProp('value', '');
  });

  it('clears the previous workspace draft when switching workspaces', async () => {
    useWorkspaceStore.setState({ choice: { userId: 'user_both', workspace: 'platform' } });
    await openThread('both@example.com', 'conv_store_1');
    await type('Reply to Rina Begum', 'Store workspace reply.');
    await switchTo('Green Leaf Goods');
    await showThread('conv_green_1');
    expect(await screen.findByLabelText('Reply to Omar Faruk')).toHaveProp('value', '');
    await switchTo('Storify Demo Store');
    await showThread('conv_store_1');
    expect(await screen.findByLabelText('Reply to Rina Begum')).toHaveProp('value', '');
  });

  it('keeps text during read-only mode and clears it when read access is revoked', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await type('Reply to Rina Begum', 'Waiting for permission.');
    const key = queryKeys.me('en');
    const me = queryClient.getQueryData<Me>(key)!;
    const without = (capability: 'REPLY_INBOX' | 'VIEW_INBOX'): Me => ({
      ...me,
      workspaces: me.workspaces.map((access) => ({
        ...access,
        capabilities: access.capabilities.filter((value) => value !== capability),
      })),
    });
    await act(async () => queryClient.setQueryData(key, without('REPLY_INBOX')));
    expect(
      await screen.findByText('You can read this conversation, but not reply to it.')
    ).toBeVisible();
    await act(async () => queryClient.setQueryData(key, me));
    expect(await screen.findByLabelText('Reply to Rina Begum')).toHaveProp(
      'value',
      'Waiting for permission.'
    );
    await act(async () => queryClient.setQueryData(key, without('VIEW_INBOX')));
    await settle();
    await act(async () => queryClient.setQueryData(key, me));
    await settle();
    await showThread('conv_store_1');
    expect(await screen.findByLabelText('Reply to Rina Begum')).toHaveProp('value', '');
  });
});

/** Why the composer is not there, where it would be. */
describe('a conversation the operator cannot reply to', () => {
  it('past WhatsApp’s window: says to answer on the website, and opens it', async () => {
    await openThread('admin@example.com', 'conv_store_2');

    expect(await screen.findByText('The reply window has closed')).toBeVisible();
    expect(
      screen.getByText(
        "WhatsApp takes a normal reply only for a while after the customer's last message. Answer this customer on the website."
      )
    ).toBeVisible();
    expect(screen.queryByLabelText('Reply to Jamal Uddin')).toBeNull();
    // What only the website can open says so.
    expect(screen.getByText('2 attachments only the website can open')).toBeVisible();

    await tap(screen.getByRole('link', { name: 'Open the website' }));
    await settle();
    expect(openedPage()).toBe(DASHBOARD);
  });

  it('a reply refused because the window closed meanwhile: the store’s word is final', async () => {
    await openThread('seller@example.com', 'conv_green_2');
    expect(await screen.findByText(/^You can reply until /)).toBeVisible();

    // The store learns of it as it sends: the conversation still reads as open.
    refuseNextReply('conv_green_2', 'REPLY_WINDOW_CLOSED');
    await type('Reply to Shirin Akter', 'They are unscented, yes.');
    await press('Send');
    await settle();

    expect(await screen.findByText('The reply window has closed')).toBeVisible();
    expect(screen.getByText('Not sent')).toBeVisible();
    expect(
      screen.getByText(
        'The reply window for this chat has closed. Send a template from the website.'
      )
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Try again' })).toBeNull();
    expect(screen.queryByLabelText('Reply to Shirin Akter')).toBeNull();
  });

  it('a refusal for the window stands until the store says otherwise: the customer writes, the window opens', async () => {
    await openThread('seller@example.com', 'conv_green_2');
    expect(await screen.findByText(/^You can reply until /)).toBeVisible();
    refuseNextReply('conv_green_2', 'REPLY_WINDOW_CLOSED');
    await type('Reply to Shirin Akter', 'They are unscented, yes.');
    await press('Send');
    await settle();
    expect(await screen.findByText('The reply window has closed')).toBeVisible();

    // Read again with nothing new: the store's word stands.
    await wait(4000);
    expect(screen.getByText('The reply window has closed')).toBeVisible();

    // The customer writes, and the channel takes replies for another day.
    receiveMockMessage('conv_green_2', 'Are they unscented?');
    setMockReplyWindow('conv_green_2', new Date(Date.now() + 24 * 60 * 60_000).toISOString());
    await wait(4000);

    expect(await screen.findByText('Are they unscented?')).toBeVisible();
    expect(screen.queryByText('The reply window has closed')).toBeNull();
    expect(screen.getByLabelText('Reply to Shirin Akter')).toBeOnTheScreen();
    // The refused reply stays as it was: not sent, with the store's reason.
    expect(screen.getByText('Not sent')).toBeVisible();
  });

  it('the window closes while the thread is open: the composer gives way then, by the phone’s clock', async () => {
    await signIn('seller@example.com');
    setMockReplyWindow('conv_green_2', new Date(Date.now() + 2000).toISOString());
    await showThread('conv_green_2');
    expect(await screen.findByLabelText('Reply to Shirin Akter')).toBeOnTheScreen();
    await type('Reply to Shirin Akter', 'I will check the stock for you.');

    // Before the thread is read again (4 seconds after it opened): no word from the store.
    await wait(2500);
    expect(screen.getByText('The reply window has closed')).toBeVisible();
    expect(screen.queryByLabelText('Reply to Shirin Akter')).toBeNull();

    setMockReplyWindow('conv_green_2', new Date(Date.now() + 60_000).toISOString());
    await wait(4000);
    expect(await screen.findByLabelText('Reply to Shirin Akter')).toHaveProp(
      'value',
      'I will check the stock for you.'
    );
  });

  it('closed: says so', async () => {
    await openThread('admin@example.com', 'conv_store_3');

    expect(await screen.findByText('This conversation is closed.')).toBeVisible();
    expect(screen.queryByLabelText('Reply to Mehedi Hasan')).toBeNull();
  });

  it('without the permission to reply: may read, not reply', async () => {
    await openThread('staff@example.com', 'conv_store_1');

    expect(
      await screen.findByText('You can read this conversation, but not reply to it.')
    ).toBeVisible();
    expect(screen.getByText('Here is the colour I am after.')).toBeVisible();
    expect(screen.queryByLabelText('Reply to Rina Begum')).toBeNull();
  });

  it('another seller’s, or the store’s: not found', async () => {
    await openThread('seller@example.com', 'conv_store_1');

    expect(
      await screen.findByText(
        "We couldn't find that. It may have been removed, or it's outside what you can see."
      )
    ).toBeVisible();
  });
});

/** What a reply carries: a product as a card, a photo or a file. */
describe('attaching to a reply', () => {
  it('shares a product as a card, with no text of its own', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });

    await press('Attach');
    await press('Share a product');
    await type('Search products by name or SKU', 'vase');
    await wait(400);
    await settle();
    await press('Share Ceramic bud vase');
    await settle();
    expect(screen.getByLabelText('Attached: Ceramic bud vase')).toBeVisible();

    await press('Send');
    await settle();

    expect(await screen.findByRole('button', { name: 'Open Ceramic bud vase' })).toBeVisible();
    // What only the product knows now: its stock, read as its own screen reads it.
    expect(await screen.findByText(/^\d+ in stock$/)).toBeVisible();
    // The name-and-link the store writes for readers without cards is not shown.
    expect(screen.queryByText(/mock\.storify\.invalid\/products/)).toBeNull();
    expect(screen.queryByLabelText('Attached: Ceramic bud vase')).toBeNull();
  });

  it('sends a photo with the text as its caption', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    jest
      .mocked(selectUploadFile)
      .mockImplementationOnce(async (_source, limits) =>
        selectedUploadFile(
          new Blob(['photo'], { type: 'image/jpeg' }),
          'wrap.jpg',
          limits,
          'image/jpeg',
          'file:///wrap.jpg'
        )
      );
    const send = jest.spyOn(inboxEndpoints, 'sendAttachment');

    await press('Attach');
    await press('Photo');
    await settle();
    expect(selectUploadFile).toHaveBeenCalledWith(
      'photo-library',
      expect.objectContaining({ mimeTypes: expect.arrayContaining(['image/jpeg']) })
    );
    expect(screen.getByLabelText('Attached: wrap.jpg')).toBeVisible();

    await type('Reply to Rina Begum', 'Wrapped like this?');
    await press('Send');
    await settle();

    expect(send).toHaveBeenCalledWith(
      expect.anything(),
      'conv_store_1',
      expect.objectContaining({ filename: 'wrap.jpg', body: 'Wrapped like this?' }),
      expect.any(String)
    );
    expect(await screen.findByText('Wrapped like this?')).toBeVisible();
    expect(screen.getAllByRole('imagebutton', { name: 'Open the picture' })).toHaveLength(2);
    send.mockRestore();
  });

  it('refuses a file the chat does not take, before sending anything', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    jest.mocked(selectUploadFile).mockImplementationOnce(async () =>
      selectedUploadFile(new Blob(['notes'], { type: 'text/plain' }), 'notes.txt', {
        maxBytes: 1024,
        mimeTypes: [],
      })
    );

    await press('Attach');
    await press('File');
    await settle();

    expect(await screen.findByText('The store does not accept this file type.')).toBeVisible();
    expect(screen.queryByLabelText('Attached: notes.txt')).toBeNull();
  });
});

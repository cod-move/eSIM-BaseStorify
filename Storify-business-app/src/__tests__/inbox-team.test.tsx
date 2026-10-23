import { act, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import * as inboxEndpoints from '@/api/endpoints/inbox';
import { changeMockConversation, refuseNextReply } from '@/api/mocks/routes/inbox';
import { dropNextRequest } from '@/api/mocks/server';
import { selectUploadFile } from '@/features/uploads/select-file';
import { selectedUploadFile } from '@/features/uploads/selected-file';

import './hooks';
import './preload-app';
import { currentPath, openTab, press, settle, signIn, tap, type, wait } from './screens';

jest.mock('@/features/uploads/select-file', () => ({ selectUploadFile: jest.fn() }));

// Several tests sign in and read threads; under a full parallel run that takes
// longer than Jest's default 5 seconds.
jest.setTimeout(20_000);

async function openThread(email: string, id: string): Promise<void> {
  await signIn(email);
  await act(async () => router.push({ pathname: '/conversations/[id]', params: { id } }));
  await settle();
}

/** A change's three tries: at once, a second later, two more after that. */
async function throughRetries(): Promise<void> {
  await settle();
  await wait(1000);
  await wait(2000);
  await settle();
}

/** The quick step chips under the customer, by name. */
function chip(name: string) {
  return screen.queryByRole('button', { name });
}

/** The team's notes on a conversation: words only the team reads. */
describe('a note for the team', () => {
  it('is written in the note’s own composer, never sent as a reply, and keeps the reply’s draft', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    const reply = jest.spyOn(inboxEndpoints, 'sendMessage');
    const note = jest.spyOn(inboxEndpoints, 'addNote');

    await type('Reply to Rina Begum', 'We do, for free.');
    await press('Attach');
    await press('Internal note');
    await settle();

    // Marked as the team's: no reply field, a lock, and who sees it.
    expect(screen.queryByLabelText('Reply to Rina Begum')).toBeNull();
    expect(screen.getByText('Internal note')).toBeVisible();
    expect(screen.getByText('Only your team sees this note.')).toBeVisible();
    await type('Note for your team about Rina Begum', 'She ordered two last spring.');
    await press('Save note');
    await settle();

    expect(note).toHaveBeenCalledTimes(1);
    expect(reply).not.toHaveBeenCalled();
    expect(screen.getAllByText('Note · Amina Rahman')).toHaveLength(2);
    expect(screen.getByText('She ordered two last spring.')).toBeVisible();
    expect(screen.getByLabelText('Note for your team about Rina Begum').props.value).toBe('');

    // Back to the reply, as it was left.
    await press('Back to the reply');
    expect(screen.getByLabelText('Reply to Rina Begum').props.value).toBe('We do, for free.');
  });

  it('on its way is drawn as a note; one that never reached the store is saved once on “Try again”', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await press('Attach');
    await press('Internal note');
    await settle();

    dropNextRequest(3, { method: 'POST', path: /\/notes$/ });
    await type('Note for your team about Rina Begum', 'Call her after five.');
    await press('Save note');
    expect(
      screen.getByLabelText(
        'Internal note, Only your team sees this note., Saving…, Call her after five.'
      )
    ).toBeVisible();
    await throughRetries();

    expect(await screen.findByText('Not saved')).toBeVisible();
    await tap(screen.getByRole('link', { name: 'Try again' }));
    await settle();

    expect(screen.queryByText('Not saved')).toBeNull();
    expect(screen.getAllByText('Call her after five.')).toHaveLength(1);
    await wait(4000);
    expect(screen.getAllByText('Call her after five.')).toHaveLength(1);
  });

  it('can be written where no reply can: a closed conversation', async () => {
    await openThread('admin@example.com', 'conv_store_3');
    expect(await screen.findByText('This conversation is closed.')).toBeVisible();

    await press('Add a note for your team');
    await type('Note for your team about Mehedi Hasan', 'Ask again in spring.');
    await press('Save note');
    await settle();

    expect(screen.getByText('Ask again in spring.')).toBeVisible();
    await press('Back to the reply');
    expect(screen.getByText('This conversation is closed.')).toBeVisible();
  });
});

describe('who has a conversation', () => {
  it('is given to someone in the team, to the operator, and to nobody', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });

    await press('Assign this conversation');
    await settle();
    expect(screen.getByRole('header', { name: 'Assign conversation' })).toBeOnTheScreen();
    await tap(screen.getByRole('radio', { name: 'Sadia Karim' }));
    await settle();
    expect(await screen.findByText('Assigned to Sadia Karim.')).toBeVisible();
    expect(chip('Assigned to Sadia Karim, change')).toBeVisible();
    expect(screen.getByText(/Assigned to Sadia Karim$/)).toBeVisible();

    await press('Assigned to Sadia Karim, change');
    await settle();
    await tap(screen.getByRole('radio', { name: 'Assign to me' }));
    await settle();
    expect(await screen.findByText('Assigned to you.')).toBeVisible();
    expect(chip('Assigned to You, change')).toBeVisible();

    await press('Assigned to You, change');
    await settle();
    // The operator is in the team too, said as theirs.
    expect(screen.getByRole('radio', { name: 'Amina Rahman (you)' })).toBeOnTheScreen();
    await tap(screen.getByRole('radio', { name: 'Unassigned' }));
    await settle();
    expect(await screen.findByText('No one is assigned now.')).toBeVisible();
    expect(chip('Assign this conversation')).toBeVisible();
  });

  it('is found in the team by name', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await press('Assign this conversation');
    await settle();

    await type('Search the team', 'tahmid');
    expect(screen.getByRole('radio', { name: 'Tahmid Hasan' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'Sadia Karim' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Unassigned' })).toBeNull();
    await type('Search the team', 'nobody here');
    expect(screen.getByText('No one found')).toBeOnTheScreen();
  });

  it('is taken by whoever may reply, who may not give it to anyone else', async () => {
    await openThread('seller-staff@example.com', 'conv_green_2');
    await screen.findByRole('header', { name: 'Shirin Akter' });

    expect(chip('Assign this conversation')).toBeNull();
    await press('Assign to me');
    await settle();
    expect(await screen.findByText('Assigned to you.')).toBeVisible();
    // Theirs now: nothing more to take.
    expect(chip('Assign to me')).toBeNull();
  });

  it('filters the inbox: the operator’s own, and nobody’s', async () => {
    await signIn('seller-staff@example.com');
    await openTab('Inbox');
    await screen.findByRole('header', { name: 'Inbox' });
    await settle();

    await press('Filter conversations');
    await tap(screen.getByRole('radio', { name: 'Assigned to me' }));
    await press('Apply');
    await settle();
    expect(screen.getByText('Showing: Assigned to me')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Omar Faruk,/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Shirin Akter,/ })).toBeNull();

    await press('Filter conversations, 1 filter on');
    await tap(screen.getByRole('radio', { name: 'Unassigned' }));
    await press('Apply');
    await settle();
    expect(screen.getByRole('button', { name: /^Shirin Akter,/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Omar Faruk,/ })).toBeNull();
  });
});

describe('resolving a conversation', () => {
  it('resolves it and opens it again', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });

    await press('Resolve');
    await settle();
    expect(await screen.findByText('Conversation resolved.')).toBeVisible();
    expect(screen.getByText('Resolved')).toBeVisible();
    expect(chip('Resolve')).toBeNull();

    await press('Reopen');
    await settle();
    expect(await screen.findByText('Conversation reopened.')).toBeVisible();
    expect(chip('Resolve')).toBeVisible();
  });

  it('says so when it was closed meanwhile on the website, and shows it as it is now', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    changeMockConversation('conv_store_1', { status: 'spam' });

    await press('Resolve');
    await settle();
    expect(
      await screen.findByText(
        'This conversation can’t take that step now: it was closed or marked as spam on the website.'
      )
    ).toBeVisible();
    expect(await screen.findByText('This conversation was marked as spam.')).toBeVisible();
    expect(chip('Resolve')).toBeNull();
  });
});

describe('what an operator is not offered', () => {
  it('a seller’s staff without the manage permission: no giving away, no resolving', async () => {
    await openThread('seller-staff@example.com', 'conv_green_1');
    await screen.findByRole('header', { name: 'Omar Faruk' });

    expect(chip('Resolve')).toBeNull();
    expect(chip('Assign this conversation')).toBeNull();
    // Already theirs, so nothing to take either; a note they may write.
    expect(chip('Assign to me')).toBeNull();
    await press('Attach');
    // The sheet's rows: the note among them.
    expect(screen.getByRole('button', { name: 'Internal note' })).toBeOnTheScreen();
  });

  it('staff who may only read: no team steps and no note', async () => {
    await openThread('staff@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });

    expect(
      await screen.findByText('You can read this conversation, but not reply to it.')
    ).toBeVisible();
    for (const name of ['Resolve', 'Reopen', 'Assign this conversation', 'Assign to me']) {
      expect(chip(name)).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Add a note for your team' })).toBeNull();
  });
});

/** A photo chosen from the library: `wrap.jpg`. */
function choosePhoto() {
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
}

describe('a thread the store stops answering for', () => {
  it('is no longer read again once the store refuses it for good, and says so', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    const reads = jest.spyOn(inboxEndpoints, 'getConversationMessages');

    // Moved to a seller's inbox, out of the store's reach: a 404 from now on.
    changeMockConversation('conv_store_1', { vendorId: 'vendor_green' });
    await wait(4000);
    await settle();
    expect(await screen.findByText('This conversation couldn’t be read again')).toBeVisible();
    // What was read stays on screen.
    expect(screen.getByText('Here is the colour I am after.')).toBeVisible();

    const asked = reads.mock.calls.length;
    await wait(20_000);
    expect(reads.mock.calls.length).toBe(asked);
  });
});

describe('the customer’s orders from a thread', () => {
  it('are offered only for a customer the store names, and open exactly theirs', async () => {
    // Jamal wrote on WhatsApp, with a phone number the store keeps no customer for.
    await openThread('admin@example.com', 'conv_store_2');
    await screen.findByRole('header', { name: 'Jamal Uddin' });
    expect(chip('Their orders')).toBeNull();

    await act(async () =>
      router.push({ pathname: '/conversations/[id]', params: { id: 'conv_store_1' } })
    );
    await settle();
    await press('Their orders');
    await settle();
    expect(currentPath()).toBe('/customers/cus_rina/orders');
  });
});

describe('a reply the store refused', () => {
  it('goes back to the draft with Edit, its product with it, or away with Discard', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });

    await press('Attach');
    await press('Share a product');
    await type('Search products by name or SKU', 'vase');
    await wait(400);
    await settle();
    await press('Share Ceramic bud vase');
    await settle();
    await type('Reply to Rina Begum', 'Two of these?');
    refuseNextReply('conv_store_1', 'CONVERSATION_CLOSED');
    await press('Send');
    await settle();

    expect(await screen.findByText('Not sent')).toBeVisible();
    // A refusal stands: no "Try again", but a way out.
    expect(screen.queryByRole('link', { name: 'Try again' })).toBeNull();
    await tap(screen.getByRole('link', { name: 'Edit' }));
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.getByLabelText('Reply to Rina Begum').props.value).toBe('Two of these?');
    expect(screen.getByLabelText('Attached: Ceramic bud vase')).toBeVisible();

    refuseNextReply('conv_store_1', 'CONVERSATION_CLOSED');
    await press('Send');
    await settle();
    await tap(screen.getByRole('link', { name: 'Discard' }));
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.queryByText('Two of these?')).toBeNull();
  });

  it('a product on the reply stays through a note and a return to the thread', async () => {
    await openThread('admin@example.com', 'conv_store_1');
    await screen.findByRole('header', { name: 'Rina Begum' });
    await press('Attach');
    await press('Share a product');
    await type('Search products by name or SKU', 'vase');
    await wait(400);
    await settle();
    await press('Share Ceramic bud vase');
    await settle();

    await press('Attach');
    await press('Internal note');
    await settle();
    await press('Back to the reply');
    expect(screen.getByLabelText('Attached: Ceramic bud vase')).toBeVisible();

    await act(async () => router.back());
    await settle();
    await act(async () =>
      router.push({ pathname: '/conversations/[id]', params: { id: 'conv_store_1' } })
    );
    await settle();
    expect(screen.getByLabelText('Attached: Ceramic bud vase')).toBeVisible();
  });
});

describe('a file on a channel that takes no caption', () => {
  it('sends its words only once the store has the file, and not when it refuses the file', async () => {
    // Messenger takes no caption.
    await openThread('seller@example.com', 'conv_green_2');
    await screen.findByRole('header', { name: 'Shirin Akter' });
    const file = jest.spyOn(inboxEndpoints, 'sendAttachment');
    const text = jest.spyOn(inboxEndpoints, 'sendMessage');

    choosePhoto();
    await press('Attach');
    await press('Photo');
    await settle();
    await type('Reply to Shirin Akter', 'The blue one.');
    refuseNextReply('conv_green_2', 'CONVERSATION_CLOSED');
    await press('Send');
    await settle();

    expect(file).toHaveBeenCalledTimes(1);
    expect(text).not.toHaveBeenCalled();
    expect(screen.getAllByText('Not sent')).toHaveLength(2);

    // Taken back as one: the photo and its words.
    await tap(screen.getAllByRole('link', { name: 'Edit' })[0]!);
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.getByLabelText('Attached: wrap.jpg')).toBeVisible();
    expect(screen.getByLabelText('Reply to Shirin Akter').props.value).toBe('The blue one.');

    await press('Send');
    await settle();
    expect(file).toHaveBeenCalledTimes(2);
    expect(text).toHaveBeenCalledTimes(1);
    expect(text.mock.invocationCallOrder[0]).toBeGreaterThan(file.mock.invocationCallOrder[1]!);
    expect(screen.queryByText('Not sent')).toBeNull();
    expect(screen.getByText('The blue one.')).toBeVisible();
  });
});

describe('a shared product', () => {
  it('the store no longer has is shown, but is not a way to it', async () => {
    await openThread('admin@example.com', 'conv_store_3');
    expect(await screen.findByText('Terracotta planter')).toBeVisible();
    await settle();
    expect(screen.queryByRole('button', { name: 'Open Terracotta planter' })).toBeNull();
  });
});

describe('one customer’s conversations', () => {
  it('are listed under a chip that names them, whose cross lists everyone’s again', async () => {
    await signIn('admin@example.com');
    await act(async () =>
      router.navigate({ pathname: '/(tabs)/inbox', params: { customerId: 'cus_rina' } })
    );
    await settle();

    expect(await screen.findByText('Showing: Rina Begum')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Rina Begum,/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Jamal Uddin,/ })).toBeNull();

    await press('Remove filter: Rina Begum');
    await settle();
    expect(screen.queryByText('Showing: Rina Begum')).toBeNull();
    expect(screen.getByRole('button', { name: /^Jamal Uddin,/ })).toBeVisible();
  });
});

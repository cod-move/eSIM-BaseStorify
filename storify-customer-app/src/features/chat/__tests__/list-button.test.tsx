import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { MessagesTile } from '@/features/account/tiles/messages-tile';
import { getMessages } from '@/i18n/messages';

const mockPush = jest.fn();
let mockAvailable = true;
let mockUnread = 3;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/chat/use-conversations', () => ({
  useChatAvailable: () => mockAvailable,
  useUnreadChatCount: () => mockUnread,
}));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('the messages button of the Account header', () => {
  beforeEach(() => {
    mockAvailable = true;
    mockUnread = 3;
    mockPush.mockClear();
  });

  it('shows the unread count the store sends, and opens the inbox', async () => {
    await render(<MessagesTile />, { wrapper: InEnglish });

    await fireEvent.press(screen.getByRole('button', { name: 'Messages, 3 unread' }));

    expect(mockPush).toHaveBeenCalledWith('/account/inbox');
  });

  it('is plain Messages when nothing is unread', async () => {
    mockUnread = 0;
    await render(<MessagesTile />, { wrapper: InEnglish });

    expect(screen.getByRole('button', { name: 'Messages' })).toBeTruthy();
  });

  it('draws nothing while chat is off, however many are unread', async () => {
    mockAvailable = false;
    await render(<MessagesTile />, { wrapper: InEnglish });

    expect(screen.queryByRole('button')).toBeNull();
  });
});

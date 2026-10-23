import { render, screen } from '@testing-library/react-native';
import { IntlProvider } from 'use-intl';

import { env } from '@/config/env';
import { getMessages } from '@/i18n/messages';

import { SigningIn, pictureUrl } from '../screens/signing-in';

function renderSigningIn(image: string | null) {
  return render(
    <IntlProvider locale="en" messages={getMessages('en')}>
      <SigningIn user={{ name: 'Jaed Al Zaber', email: 'jaed@example.com', image }} />
    </IntlProvider>
  );
}

describe('SigningIn', () => {
  it('shows the shopper’s picture over their initials', async () => {
    await renderSigningIn('https://cdn.example.com/me.jpg');

    expect(screen.getByText('JA', { includeHiddenElements: true })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain('https://cdn.example.com/me.jpg');
  });

  it('shows only the initials without a picture', async () => {
    await renderSigningIn(null);

    expect(screen.getByText('JA', { includeHiddenElements: true })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toContain('uri');
  });
});

describe('pictureUrl', () => {
  it('keeps an address, makes an upload path one on the store, and drops anything else', () => {
    expect(pictureUrl('https://cdn.example.com/me.jpg')).toBe('https://cdn.example.com/me.jpg');
    expect(pictureUrl('/uploads/me.jpg')).toBe(
      new URL('/uploads/me.jpg', `${env.apiUrl}/`).toString()
    );
    expect(pictureUrl('javascript:alert(1)')).toBeUndefined();
    expect(pictureUrl(null)).toBeUndefined();
  });
});

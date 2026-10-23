import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { imageTextBlock } from '@/api/mocks/fixtures/home-content-blocks';
import { getMessages } from '@/i18n/messages';

import { ImageText } from '../blocks/image-text';

jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => jest.fn() }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('ImageText', () => {
  it('draws the heading and the button', async () => {
    await render(<ImageText block={imageTextBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('Made by hand')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Meet the makers' })).toBeTruthy();
  });
});

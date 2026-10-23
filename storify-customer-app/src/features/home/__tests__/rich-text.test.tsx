import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { richTextBlock } from '@/api/mocks/fixtures/home-content-blocks';
import { getMessages } from '@/i18n/messages';

import { RichText } from '../blocks/rich-text';

jest.mock('@/features/config/use-open-link', () => ({ useOpenLink: () => jest.fn() }));

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('RichText', () => {
  it('draws its heading and its paragraph', async () => {
    await render(<RichText block={richTextBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('Our story')).toBeTruthy();
    expect(screen.getByText(/pack every order by hand/)).toBeTruthy();
  });
});

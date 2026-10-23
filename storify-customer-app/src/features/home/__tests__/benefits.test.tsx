import { render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { benefitsBlock } from '@/api/mocks/fixtures/home-content-blocks';
import { getMessages } from '@/i18n/messages';

import { Benefits } from '../blocks/benefits';

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('Benefits', () => {
  it('draws each promise with its detail', async () => {
    await render(<Benefits block={benefitsBlock} />, { wrapper: InEnglish });

    expect(screen.getByText('Free delivery')).toBeTruthy();
    expect(screen.getByText('On orders over 1,000')).toBeTruthy();
  });
});

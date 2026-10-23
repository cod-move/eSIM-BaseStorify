import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { faqBlock } from '@/api/mocks/fixtures/home-content-blocks';
import { getMessages } from '@/i18n/messages';

import { Faq } from '../blocks/faq';

function InEnglish({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

describe('Faq', () => {
  it('opens an answer under its question and closes it again', async () => {
    await render(<Faq block={faqBlock} />, { wrapper: InEnglish });
    const question = screen.getByRole('button', { name: 'How long does delivery take?' });

    expect(screen.getByText('Questions')).toBeTruthy();
    expect(screen.queryByText('Two to four working days.')).toBeNull();

    await fireEvent.press(question);
    expect(screen.getByText('Two to four working days.')).toBeTruthy();

    await fireEvent.press(question);
    expect(screen.queryByText('Two to four working days.')).toBeNull();
  });
});

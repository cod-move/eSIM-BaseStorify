import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { Button } from '../button';
import { Sheet, SheetActions } from '../sheet';
import { Text } from '../text';

const inLocale = (locale: string) =>
  function LocaleProvider({ children }: PropsWithChildren) {
    return (
      <IntlProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </IntlProvider>
    );
  };

const open = (props: Partial<Parameters<typeof Sheet>[0]> = {}) => (
  <Sheet visible title="Filter" onClose={() => {}} {...props}>
    <Text>Pick a colour</Text>
  </Sheet>
);

describe('Sheet', () => {
  it('shows its title and body when open, and nothing when closed', async () => {
    const { rerender } = await render(open({ visible: false }), { wrapper: inLocale('en') });
    expect(screen.queryByText('Filter')).toBeNull();

    await rerender(open());
    expect(screen.getByRole('header', { name: 'Filter' })).toBeOnTheScreen();
    expect(screen.getByText('Pick a colour')).toBeOnTheScreen();
  });

  it('closes from the close button and from the dimmed page', async () => {
    const onClose = jest.fn();
    await render(open({ onClose }), { wrapper: inLocale('en') });

    // The page behind the sheet comes first in the tree, the button in the header after it.
    const buttons = screen.getAllByRole('button', { name: 'Close' });
    expect(buttons).toHaveLength(2);
    const [page, button] = buttons as [(typeof buttons)[number], (typeof buttons)[number]];

    await fireEvent.press(button);
    expect(onClose).toHaveBeenCalledTimes(1);
    await fireEvent.press(page);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('leaves the screen once it is told to close', async () => {
    const { rerender } = await render(open(), { wrapper: inLocale('en') });
    expect(screen.getByText('Pick a colour')).toBeOnTheScreen();

    await rerender(open({ visible: false }));
    await waitFor(() => expect(screen.queryByText('Pick a colour')).toBeNull());
  });

  it('has a back button only in a sub-sheet', async () => {
    const onBack = jest.fn();
    const { rerender } = await render(open(), { wrapper: inLocale('en') });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

    await rerender(open({ onBack }));
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('pins its footer under the body', async () => {
    const onApply = jest.fn();
    const onReset = jest.fn();
    await render(
      open({
        footer: (
          <SheetActions>
            <Button label="Reset" variant="secondary" onPress={onReset} />
            <Button label="Apply" onPress={onApply} />
          </SheetActions>
        ),
      }),
      { wrapper: inLocale('en') }
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Apply' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Reset' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('names its buttons in the shopper language', async () => {
    await render(open({ onBack: () => {} }), { wrapper: inLocale('ar') });

    expect(screen.getAllByRole('button', { name: 'إغلاق' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'رجوع' })).toBeOnTheScreen();
  });
});

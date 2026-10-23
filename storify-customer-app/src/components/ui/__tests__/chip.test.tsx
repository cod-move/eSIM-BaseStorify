import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { Chip } from '../chip';

const wrapper = ({ children }: PropsWithChildren) => (
  <IntlProvider locale="en" messages={getMessages('en')}>
    {children}
  </IntlProvider>
);

describe('Chip', () => {
  it('is a button named by its label, and presses', async () => {
    const onPress = jest.fn();
    await render(<Chip label="In stock" onPress={onPress} />, { wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'In stock' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says whether it is selected', async () => {
    await render(
      <>
        <Chip label="All" selected />
        <Chip label="In stock" />
      </>,
      { wrapper }
    );

    expect(screen.getByRole('button', { name: 'All' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'In stock' })).not.toBeSelected();
  });

  it('does not press while disabled', async () => {
    const onPress = jest.fn();
    await render(<Chip label="Out of stock" disabled onPress={onPress} />, { wrapper });

    const chip = screen.getByRole('button', { name: 'Out of stock' });
    expect(chip).toBeDisabled();
    await fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('presses while unavailable, and says it is unavailable', async () => {
    const onPress = jest.fn();
    await render(<Chip kind="option" label="512 GB" unavailable onPress={onPress} />, { wrapper });

    const chip = screen.getByRole('button', { name: 'Unavailable, 512 GB' });
    expect(chip).not.toBeDisabled();
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('takes a picture, a swatch or plain text', async () => {
    await render(
      <>
        <Chip kind="picture" label="Phones" />
        <Chip kind="option" label="Blue" swatch="#2b6bff" />
        <Chip kind="option" label="128 GB" />
      </>,
      { wrapper }
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });
});

import { fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { Button, TextLink } from '../button';

const wrapper = ({ children }: PropsWithChildren) => (
  <IntlProvider locale="en" messages={getMessages('en')}>
    {children}
  </IntlProvider>
);

describe('Button', () => {
  it('is a button named by its label, and presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Add to cart" onPress={onPress} />, { wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Add to cart' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('says its trailing amount with the label, as printed', async () => {
    await render(<Button label="Pay Now" trailing="$3,397.00" onPress={jest.fn()} />, { wrapper });

    expect(screen.getByText('$3,397.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pay Now, $3,397.00' })).toBeTruthy();
  });

  it('keeps its label for screen readers while busy, and ignores presses', async () => {
    const onPress = jest.fn();
    await render(<Button label="Add to cart" loading onPress={onPress} />, { wrapper });

    const button = screen.getByRole('button', { name: 'Add to cart' });
    expect(button).toBeBusy();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not press while disabled, and says so', async () => {
    const onPress = jest.fn();
    await render(<Button label="Cancel" variant="secondary" disabled onPress={onPress} />, {
      wrapper,
    });

    const button = screen.getByRole('button', { name: 'Cancel' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is a button in every kind and both sizes', async () => {
    await render(
      <>
        {(['primary', 'accent', 'secondary', 'outline', 'ghost', 'social', 'danger'] as const).map(
          (variant) => (
            <Button key={variant} label={variant} variant={variant} onPress={jest.fn()} />
          )
        )}
        <Button label="small" size="sm" onPress={jest.fn()} />
      </>,
      { wrapper }
    );

    expect(screen.getAllByRole('button')).toHaveLength(8);
  });
});

describe('TextLink', () => {
  it('is a link named by its label, and presses', async () => {
    const onPress = jest.fn();
    await render(<TextLink label="View All" onPress={onPress} />, { wrapper });

    await fireEvent.press(screen.getByRole('link', { name: 'View All' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';

import { Button } from '../button';
import { ToastHost, useToast } from '../toast';

function Wrapper({ children }: PropsWithChildren) {
  return (
    <IntlProvider locale="en" messages={getMessages('en')}>
      {children}
    </IntlProvider>
  );
}

function Page({ onAction }: { onAction?: () => void }) {
  const toast = useToast();

  return (
    <>
      <Button label="Add" onPress={() => toast.show({ message: 'Added to cart' })} />
      <Button
        label="Add and offer"
        onPress={() =>
          toast.show({
            message: 'Saved',
            action: { label: 'View cart', onPress: onAction ?? (() => {}) },
          })
        }
      />
      <ToastHost bottomOffset={88} />
    </>
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('Toast', () => {
  it('shows nothing until a screen asks for one', async () => {
    await render(<Page />, { wrapper: Wrapper });
    expect(screen.queryByText('Added to cart')).toBeNull();
  });

  it('shows the message and takes it away after about 4 s', async () => {
    await render(<Page />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Added to cart')).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(3500);
    });
    expect(screen.getByText('Added to cart')).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(600);
    });
    expect(screen.queryByText('Added to cart')).toBeNull();
  });

  it('runs its action and goes', async () => {
    const onAction = jest.fn();
    await render(<Page onAction={onAction} />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Add and offer' }));
    await fireEvent.press(screen.getByRole('button', { name: 'View cart' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('gives way to a newer toast, which gets its own 4 s', async () => {
    await render(<Page />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Add and offer' }));
    expect(screen.getByText('Saved')).toBeOnTheScreen();

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Saved')).toBeOnTheScreen();
  });
});

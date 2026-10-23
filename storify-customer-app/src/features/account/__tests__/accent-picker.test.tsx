import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { IntlProvider } from 'use-intl';

import { getMessages } from '@/i18n/messages';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { storage } from '@/lib/storage';
import { useThemeStore } from '@/theme/theme-store';

import { AccentPicker } from '../accent-picker';

function renderPicker() {
  return render(
    <IntlProvider locale="en" messages={getMessages('en')}>
      <AccentPicker />
    </IntlProvider>
  );
}

beforeEach(() => {
  storage.remove(STORAGE_KEYS.accent);
  useThemeStore.setState({ accent: null });
});

describe('the accent colour picker', () => {
  it('shows the store’s colour as the current one until a colour is picked', async () => {
    await renderPicker();

    const swatch = screen.getByRole('button', { name: 'Accent Color' });
    expect(swatch.props.accessibilityValue).toEqual({ text: 'Store default' });
  });

  it('lists the store default and twelve colours, each named', async () => {
    await renderPicker();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Accent Color' })));

    const names = [
      'Store default',
      'Blue',
      'Violet',
      'Purple',
      'Pink',
      'Red',
      'Orange',
      'Amber',
      'Lime',
      'Green',
      'Teal',
      'Sand',
      'Graphite',
    ];
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual(
      names
    );
    expect(screen.getByRole('radio', { name: 'Store default' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );
  });

  it('applies a pick at once, keeps it on the device and marks it chosen', async () => {
    await renderPicker();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Accent Color' })));
    await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Teal' })));

    expect(useThemeStore.getState().accent).toBe('teal');
    expect(storage.get(STORAGE_KEYS.accent)).toBe('teal');
    expect(screen.getByRole('button', { name: 'Accent Color' }).props.accessibilityValue).toEqual({
      text: 'Teal',
    });
  });

  it('goes back to the store’s colour when "Store default" is picked', async () => {
    useThemeStore.getState().chooseAccent('pink');
    await renderPicker();
    await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Accent Color' })));
    expect(screen.getByRole('radio', { name: 'Pink' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true })
    );

    await act(async () => fireEvent.press(screen.getByRole('radio', { name: 'Store default' })));

    expect(useThemeStore.getState().accent).toBeNull();
    expect(storage.get(STORAGE_KEYS.accent)).toBeNull();
  });
});

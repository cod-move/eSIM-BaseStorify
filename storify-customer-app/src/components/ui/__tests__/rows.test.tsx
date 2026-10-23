import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { I18nProvider } from '@/i18n/provider';

import { CheckRow, NavRow, RadioRow, RowGroup, SwitchRow } from '../rows';
import { SearchField } from '../search-field';
import { SelectButton } from '../select-button';

const renderRows = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider });

describe('rows', () => {
  it('a nav row reads its title with its value', async () => {
    const onPress = jest.fn();
    await renderRows(
      <RowGroup>
        <NavRow title="Sort by" value="Trending" onPress={onPress} />
        <NavRow
          title="Reviews"
          value={<Text>★ 4.89</Text>}
          valueLabel="4.89 out of 5"
          onPress={onPress}
        />
        <NavRow title="Language" disabled onPress={onPress} />
      </RowGroup>
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Sort by, Trending' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Reviews, 4.89 out of 5' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Language' })).toBeDisabled();
  });

  it('radio rows say which one is chosen', async () => {
    const onSelect = jest.fn();
    await renderRows(
      <RowGroup accessibilityRole="radiogroup">
        <RadioRow title="Trending" selected={false} onSelect={onSelect} />
        <RadioRow title="Newest" selected onSelect={() => {}} />
      </RowGroup>
    );

    expect(screen.getByRole('radio', { name: 'Newest' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Trending' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Trending' }));
    expect(onSelect).toHaveBeenCalled();
  });

  it('a check row flips its box', async () => {
    const onCheckedChange = jest.fn();
    await renderRows(
      <CheckRow title="Black" swatch="#1c1c1c" checked={false} onCheckedChange={onCheckedChange} />
    );

    const row = screen.getByRole('checkbox', { name: 'Black' });
    expect(row).not.toBeChecked();
    await fireEvent.press(row);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('a switch row is one switch, named by its title, flipped by the switch or the row', async () => {
    const onValueChange = jest.fn();
    await renderRows(
      <SwitchRow
        title="Order Updates"
        description="Get notified about your order status changes."
        value
        onValueChange={onValueChange}
      />
    );

    const toggle = screen.getByRole('switch', { name: 'Order Updates' });
    expect(toggle).toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(1);

    await fireEvent.press(screen.getByText('Order Updates'));
    expect(onValueChange).toHaveBeenLastCalledWith(false);
  });
});

describe('SearchField', () => {
  it('clears what was typed, and submits from the keyboard or its button', async () => {
    const onChangeText = jest.fn();
    const onSubmit = jest.fn();
    const { rerender } = await renderRows(
      <SearchField
        label="Search products"
        value=""
        onChangeText={onChangeText}
        onSubmit={onSubmit}
      />
    );

    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();

    await rerender(
      <SearchField
        label="Search products"
        value="iPhone"
        onChangeText={onChangeText}
        onSubmit={onSubmit}
      />
    );
    await fireEvent(screen.getByLabelText('Search products'), 'submitEditing');
    expect(onSubmit).toHaveBeenLastCalledWith('iPhone');
    await fireEvent.press(screen.getByRole('button', { name: 'Search' }));
    expect(onSubmit).toHaveBeenCalledTimes(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChangeText).toHaveBeenLastCalledWith('');
  });
});

describe('SelectButton', () => {
  it('reads its label and value, and whether its choices are open', async () => {
    const onPress = jest.fn();
    await renderRows(<SelectButton label="Country" value="Bangladesh" open onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Country, Bangladesh' });
    expect(button).toBeExpanded();
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalled();
  });

  it('reads the placeholder while nothing is chosen', async () => {
    await renderRows(
      <SelectButton label="Country" placeholder="Choose a country" onPress={jest.fn()} />
    );

    expect(screen.getByRole('button', { name: 'Country, Choose a country' })).toBeTruthy();
  });
});

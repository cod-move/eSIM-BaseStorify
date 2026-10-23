import { fireEvent, render, screen } from '@testing-library/react-native';

import { I18nProvider } from '@/i18n/provider';

import { Stepper } from '../stepper';

const renderStepper = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider });

describe('Stepper', () => {
  it('asks for one more and one less, and reads the quantity', async () => {
    const onChange = jest.fn();
    await renderStepper(<Stepper value={3} max={10} onChange={onChange} />);

    expect(screen.getByLabelText('Quantity: 3')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Increase quantity' }));
    expect(onChange).toHaveBeenLastCalledWith(4);
    await fireEvent.press(screen.getByRole('button', { name: 'Decrease quantity' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('turns minus into a bin at the least quantity of a removable line', async () => {
    const onRemove = jest.fn();
    const onChange = jest.fn();
    await renderStepper(
      <Stepper value={1} max={10} removable onRemove={onRemove} onChange={onChange} />
    );

    expect(screen.queryByRole('button', { name: 'Decrease quantity' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops at the store’s least and most', async () => {
    const { rerender } = await renderStepper(
      <Stepper value={2} min={2} max={10} onChange={jest.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeEnabled();

    await rerender(<Stepper value={5} max={5} removable onChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Increase quantity' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decrease quantity' })).toBeEnabled();
  });

  it('waits, every button off, while a change is on its way', async () => {
    const onChange = jest.fn();
    await renderStepper(<Stepper value={2} max={10} removable busy onChange={onChange} />);

    for (const name of ['Decrease quantity', 'Increase quantity']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toBeBusy();
      await fireEvent.press(button);
    }
    expect(onChange).not.toHaveBeenCalled();
  });
});

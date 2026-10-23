import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform } from 'react-native';

import { I18nProvider } from '@/i18n/provider';

import { CodeInput, toCode } from '../code-input';

const LABEL = 'Your 6-digit code';

function Harness({ onComplete, error }: { onComplete?: (code: string) => void; error?: string }) {
  const [code, setCode] = useState('');
  return (
    <CodeInput
      label={LABEL}
      value={code}
      onChangeText={setCode}
      onComplete={onComplete}
      error={error}
    />
  );
}

const renderCode = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider });
const field = () => screen.getByLabelText(LABEL);
/** The digits drawn in the boxes, which screen readers skip (they read the field). */
const boxes = () =>
  screen
    .getAllByText(/^\d$/, { includeHiddenElements: true })
    .map((box) => box.props.children as string)
    .join('');

describe('CodeInput', () => {
  it('fills every box from a pasted code, and reports it complete', async () => {
    const onComplete = jest.fn();
    await renderCode(<Harness onComplete={onComplete} />);

    await fireEvent.changeText(field(), '128406');

    expect(field()).toHaveDisplayValue('128406');
    expect(boxes()).toBe('128406');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('128406');
  });

  it('takes the digits out of whatever was pasted around them', async () => {
    await renderCode(<Harness />);

    await fireEvent.changeText(field(), 'Your code is 123 456.');
    expect(field()).toHaveDisplayValue('123456');
  });

  it('replaces digits already typed when a whole code is pasted after them', async () => {
    await renderCode(<Harness />);

    await fireEvent.changeText(field(), '12');
    expect(boxes()).toBe('12');
    await fireEvent.changeText(field(), '12987654');
    expect(field()).toHaveDisplayValue('987654');
  });

  it('ignores a seventh digit and anything that is not a digit', async () => {
    const onComplete = jest.fn();
    await renderCode(<Harness onComplete={onComplete} />);

    await fireEvent.changeText(field(), '123456');
    await fireEvent.changeText(field(), '1234567');
    await fireEvent.changeText(field(), '123456a');
    expect(field()).toHaveDisplayValue('123456');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('is one field for screen readers, open to the one-time-code autofill', async () => {
    await renderCode(<Harness />);

    expect(screen.getAllByLabelText(LABEL)).toHaveLength(1);
    // The boxes are a drawing: nothing in them is read on its own.
    await fireEvent.changeText(field(), '12');
    expect(screen.queryByText('1')).toBeNull();
    expect(field().props.textContentType).toBe('oneTimeCode');
    expect(field().props.autoComplete).toBe(
      Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'
    );
    expect(field().props.keyboardType).toBe('number-pad');
  });

  it('shows and announces an error', async () => {
    await renderCode(<Harness error="That code is not right." />);

    expect(screen.getByRole('alert')).toHaveTextContent('That code is not right.');
    expect(field().props.accessibilityHint).toBe('That code is not right.');
  });
});

describe('toCode', () => {
  it('reads the digits an Arabic, Persian, Hindi or Bengali keyboard types as 0 to 9', () => {
    expect(toCode('١٢٣٤٥٦', 6)).toBe('123456');
    expect(toCode('۷۸۹۰۱۲', 6)).toBe('789012');
    expect(toCode('३४५६७८', 6)).toBe('345678');
    expect(toCode('০৯৮৭৬৫', 6)).toBe('098765');
  });

  it('keeps at most `length` digits', () => {
    expect(toCode('12-34-56-78', 6)).toBe('123456');
    expect(toCode('', 6)).toBe('');
  });
});

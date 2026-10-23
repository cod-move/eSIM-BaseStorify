import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TextInput, View } from 'react-native';
import * as z from 'zod';

import { I18nProvider } from '@/i18n/provider';

import { Button } from '../button';
import { PasswordField } from '../password-field';
import { FieldSurfaceProvider, TextField } from '../text-field';

// A sign-in form built the way features/auth/login-form.tsx builds one: a zod
// schema whose messages are keys, one Controller per field, the error read
// from `fieldState`.
const schema = z.object({
  email: z.string().trim().min(1, 'required').pipe(z.email('email')),
  password: z.string().min(1, 'required'),
});
type Values = z.infer<typeof schema>;

const MESSAGES: Record<string, string> = {
  required: 'This field is required',
  email: 'Enter a valid email address',
};

function SignInForm({ onValid }: { onValid: (values: Values) => void }) {
  const { control, handleSubmit } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const submit = handleSubmit(onValid);

  return (
    <View>
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <TextField
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message && MESSAGES[fieldState.error.message]}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <PasswordField
            label="Password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message && MESSAGES[fieldState.error.message]}
          />
        )}
      />
      <Button label="Sign in" onPress={submit} />
    </View>
  );
}

const renderWithIntl = (ui: React.ReactElement) => render(ui, { wrapper: I18nProvider });

describe('TextField and PasswordField in a react-hook-form form', () => {
  it('shows each error under its field, announces it, and clears it once the value is valid', async () => {
    const onValid = jest.fn();
    await renderWithIntl(<SignInForm onValid={onValid} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findAllByText('This field is required')).toHaveLength(2);
    // Each error is an alert, and the field it belongs to reads it as its hint.
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe('This field is required');
    expect(screen.getByLabelText('Password').props.accessibilityHint).toBe(
      'This field is required'
    );

    await fireEvent.changeText(screen.getByLabelText('Email'), 'nadia@');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(screen.queryByText('This field is required')).toBeNull();
    expect(onValid).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText('Email'), 'nadia@example.com');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onValid.mock.calls[0]?.[0]).toEqual({ email: 'nadia@example.com', password: 'secret' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TextField', () => {
  it('hands its ref and every TextInput prop to the input', async () => {
    const ref = createRef<TextInput>();
    const onFocus = jest.fn();
    await renderWithIntl(
      <TextField
        ref={ref}
        label="Email"
        placeholder="name@example.com"
        keyboardType="email-address"
        onFocus={onFocus}
      />
    );

    const input = screen.getByLabelText('Email');
    expect(ref.current).not.toBeNull();
    expect(input.props.placeholder).toBe('name@example.com');
    expect(input.props.keyboardType).toBe('email-address');
    await fireEvent(input, 'focus');
    expect(onFocus).toHaveBeenCalled();
  });

  it('says when a field is optional or required, and when it is disabled', async () => {
    await renderWithIntl(
      <View>
        <TextField label="Company" optional />
        <TextField label="Code" required />
        <TextField label="Email" editable={false} hint="As on your ID." />
      </View>
    );

    expect(screen.getByLabelText('Company, Optional')).toBeTruthy();
    expect(screen.getByLabelText('Code, Required')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Email').props.accessibilityHint).toBe('As on your ID.');
  });
});

describe('PasswordField', () => {
  it('shows and hides the password with a labelled button', async () => {
    await renderWithIntl(<PasswordField label="Password" defaultValue="secret" />);

    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
  });

  it('shows the rules it is given, and reads whether each is met', async () => {
    await renderWithIntl(
      <PasswordField
        label="New password"
        rules={[
          { label: 'At least 8 characters', met: true },
          { label: 'One number', met: false },
        ]}
      />
    );

    expect(screen.getByLabelText('At least 8 characters: done')).toBeTruthy();
    expect(screen.getByLabelText('One number: not yet')).toBeTruthy();
  });
});

describe('the surface a field sits on', () => {
  const boxOf = (label: string) => screen.getByLabelText(label).parent?.props.className as string;

  it('takes the sheet it is in, unless it is told otherwise', async () => {
    await renderWithIntl(
      <>
        <TextField label="On the page" />
        <FieldSurfaceProvider value="surface">
          <TextField label="In a sheet" />
          <PasswordField label="Password in a sheet" />
          <TextField label="Told it is on the page" on="background" />
        </FieldSurfaceProvider>
      </>
    );

    expect(boxOf('On the page')).toContain('bg-surface ');
    expect(boxOf('In a sheet')).toContain('bg-surface-alt');
    expect(boxOf('Password in a sheet')).toContain('bg-surface-alt');
    expect(boxOf('Told it is on the page')).toContain('bg-surface ');
  });
});

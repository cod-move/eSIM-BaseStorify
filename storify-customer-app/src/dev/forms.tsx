import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { PasswordField } from '@/components/ui/password-field';
import { CheckRow, NavRow, RadioRow, RowGroup, SwitchRow } from '@/components/ui/rows';
import { SearchButton, SearchField } from '@/components/ui/search-field';
import { SelectButton } from '@/components/ui/select-button';
import { Stepper } from '@/components/ui/stepper';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import { GalleryItem, GalleryPage, GallerySection } from './gallery-kit';

/**
 * The kit gallery's page of form controls and rows, each in its states.
 *
 * The sample labels, values and errors below stand in for what a screen
 * passes in. Like the gallery's own names they are for developers, in
 * English; the words the components say themselves (show password, clear
 * search, remove) come from the `fields` messages and follow the language.
 */
export function FormsGallery() {
  return (
    <GalleryPage>
      <TextFields />
      <FormSection />
      <PasswordFields />
      <CodeInputs />
      <SelectButtons />
      <SearchFields />
      <NavRows />
      <RadioRows />
      <CheckRows />
      <SwitchRows />
      <Switches />
      <Steppers />
    </GalleryPage>
  );
}

const EMAIL = 'name@example.com';

function TextFields() {
  const [typed, setTyped] = useState('');

  return (
    <GallerySection title="Text field">
      <GalleryItem label="Empty, with a placeholder">
        <TextField label="Email" placeholder={EMAIL} value={typed} onChangeText={setTyped} />
      </GalleryItem>
      <GalleryItem label="Focused (has focus when the page opens)">
        <TextField label="First name" placeholder="John" autoFocus />
      </GalleryItem>
      <GalleryItem label="Filled, with helper text">
        <TextField label="Last name" defaultValue="Doe" hint="As it appears on your ID." />
      </GalleryItem>
      <GalleryItem label="Optional">
        <TextField label="Company" placeholder="Storify Ltd." optional />
      </GalleryItem>
      <GalleryItem label="Error">
        <TextField label="Email" defaultValue="name@example" error="Enter a valid email address." />
      </GalleryItem>
      <GalleryItem label="Disabled">
        <TextField label="Email" defaultValue={EMAIL} editable={false} />
      </GalleryItem>
      <GalleryItem label="Multiline">
        <TextField
          label="Order notes"
          placeholder="Leave the parcel with the neighbour."
          multiline
          optional
        />
      </GalleryItem>
      <GalleryItem label="On a surface card (Profile): empty, filled, error">
        <View className="gap-4 rounded-xl bg-surface p-5">
          <TextField on="surface" label="First name" placeholder="John" />
          <TextField on="surface" label="Last name" defaultValue="Doe" />
          <TextField
            on="surface"
            label="Email"
            defaultValue="name@"
            error="Enter a valid email address."
          />
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

// The pattern of features/auth/login-form.tsx: a zod schema, one Controller per
// field, the error from `fieldState`.
const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'This field is required.')
    .pipe(z.email('Enter a valid email address.')),
  password: z.string().min(8, 'At least 8 characters.'),
});

function FormSection() {
  const [sent, setSent] = useState(false);
  const { control, handleSubmit } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });
  const submit = handleSubmit(() => setSent(true));

  return (
    <GallerySection title="A form (react-hook-form)">
      <GalleryItem label="Press Sign in with the fields empty: the errors appear under them">
        <View className="gap-4">
          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <TextField
                label="Email"
                placeholder={EMAIL}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <PasswordField
                label="Password"
                placeholder="password"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                onSubmitEditing={submit}
              />
            )}
          />
          <Button label="Sign in" variant="accent" onPress={submit} />
          {sent ? <Text variant="caption">Valid: the form would be sent.</Text> : null}
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

function PasswordFields() {
  const [password, setPassword] = useState('secret1');
  const rules = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One capital letter', met: /[A-Z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
  ];

  return (
    <GallerySection title="Password field">
      <GalleryItem label="Empty">
        <PasswordField label="Password" placeholder="password" />
      </GalleryItem>
      <GalleryItem label="Filled, hidden (the eye shows it)">
        <PasswordField label="Old password" defaultValue="correct horse" />
      </GalleryItem>
      <GalleryItem label="With the store's rules, as the shopper types">
        <PasswordField
          label="New password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          rules={rules}
        />
      </GalleryItem>
      <GalleryItem label="Error">
        <PasswordField
          label="Confirm password"
          defaultValue="secret"
          error="The passwords do not match."
        />
      </GalleryItem>
      <GalleryItem label="Disabled">
        <PasswordField label="Password" defaultValue="secret" editable={false} />
      </GalleryItem>
    </GallerySection>
  );
}

function CodeInputs() {
  const [code, setCode] = useState('');
  const [done, setDone] = useState<string | null>(null);

  return (
    <GallerySection title="Code input">
      <GalleryItem label="Live: type or paste a code; it reports the sixth digit">
        <CodeInput
          label="Your 6-digit code"
          required
          value={code}
          onChangeText={(next) => {
            setCode(next);
            setDone(null);
          }}
          onComplete={setDone}
        />
        {done ? <Text variant="caption">{`Complete: ${done}`}</Text> : null}
      </GalleryItem>
      <GalleryItem label="Empty">
        <CodeInput label="Your 6-digit code" required value="" onChangeText={() => {}} />
      </GalleryItem>
      <GalleryItem label="Partly typed">
        <CodeInput label="Your 6-digit code" required value="128" onChangeText={() => {}} />
      </GalleryItem>
      <GalleryItem label="Full">
        <CodeInput label="Your 6-digit code" required value="128406" onChangeText={() => {}} />
      </GalleryItem>
      <GalleryItem label="Error">
        <CodeInput
          label="Your 6-digit code"
          required
          value="128406"
          onChangeText={() => {}}
          error="That code is not right. Check it and try again."
        />
      </GalleryItem>
      <GalleryItem label="Disabled">
        <CodeInput label="Your 6-digit code" value="12" onChangeText={() => {}} editable={false} />
      </GalleryItem>
    </GallerySection>
  );
}

function SelectButtons() {
  return (
    <GallerySection title="Select button">
      <GalleryItem label="Placeholder">
        <SelectButton label="Country" placeholder="Choose a country" onPress={() => {}} />
      </GalleryItem>
      <GalleryItem label="Chosen">
        <SelectButton label="Country" value="Bangladesh" onPress={() => {}} />
      </GalleryItem>
      <GalleryItem label="Open (its sheet is up)">
        <SelectButton label="Country" value="Bangladesh" open onPress={() => {}} />
      </GalleryItem>
      <GalleryItem label="Error">
        <SelectButton
          label="Country"
          placeholder="Choose a country"
          error="Choose where to deliver."
          onPress={() => {}}
        />
      </GalleryItem>
      <GalleryItem label="Disabled">
        <SelectButton label="Country" value="Bangladesh" disabled onPress={() => {}} />
      </GalleryItem>
      <GalleryItem label="Phone field: a country box beside the number">
        <TextField
          label="Phone number"
          placeholder="1712 345678"
          keyboardType="phone-pad"
          autoComplete="tel"
          before={
            <SelectButton value="+880" accessibilityLabel="Country code, +880" onPress={() => {}} />
          }
        />
      </GalleryItem>
      <GalleryItem label="Date field: opens the phone's date picker">
        <SelectButton
          label="Birthday"
          placeholder="mm/dd/yyyy"
          icon="calendar"
          optional
          onPress={() => {}}
        />
      </GalleryItem>
    </GallerySection>
  );
}

function SearchFields() {
  const [query, setQuery] = useState('');
  const [filled, setFilled] = useState('iPhone 16');
  const [searched, setSearched] = useState<string | null>(null);

  return (
    <GallerySection title="Search field">
      <GalleryItem label="Empty">
        <SearchField
          label="Search products"
          placeholder="Search products..."
          value={query}
          onChangeText={setQuery}
          onSubmit={setSearched}
        />
        {searched !== null ? <Text variant="caption">{`Searched: "${searched}"`}</Text> : null}
      </GalleryItem>
      <GalleryItem label="Filled, with the clear button">
        <SearchField
          label="Search products"
          placeholder="Search products..."
          value={filled}
          onChangeText={setFilled}
          onSubmit={setSearched}
        />
      </GalleryItem>
      <GalleryItem label="Home: a button that opens search">
        <SearchButton label="Search products..." onPress={() => {}} />
      </GalleryItem>
    </GallerySection>
  );
}

function NavRows() {
  return (
    <GallerySection title="Nav rows">
      <GalleryItem label="In a card: title and description; icon and value; disabled">
        <RowGroup>
          <NavRow title="Change Password" description="Reset password" onPress={() => {}} />
          <NavRow icon="globe" title="Language" value="English" onPress={() => {}} />
          <NavRow icon="bell" title="Notifications" onPress={() => {}} />
          <NavRow
            icon="lock"
            title="Two-step verification"
            value="Off"
            disabled
            onPress={() => {}}
          />
        </RowGroup>
      </GalleryItem>
      <GalleryItem label="On a sheet: a value that is a drawing (Reviews ★ 4.89 (380))">
        <RowGroup card={false}>
          <NavRow title="Sort by" value="Trending" onPress={() => {}} />
          <NavRow
            title="Reviews"
            value={
              <View className="flex-row items-center gap-1">
                <Text variant="label">★ 4.89</Text>
                <Text className="text-muted">(380)</Text>
              </View>
            }
            valueLabel="4.89 out of 5, 380 reviews"
            onPress={() => {}}
          />
        </RowGroup>
      </GalleryItem>
    </GallerySection>
  );
}

const SORTS = ['Trending', 'Newest', 'Lowest → Highest Price', 'Highest → Lowest Price'];

function RadioRows() {
  const [sort, setSort] = useState('Newest');

  return (
    <GallerySection title="Radio rows">
      <GalleryItem label="On a sheet (Sort): one chosen; the last disabled">
        <RowGroup card={false} accessibilityRole="radiogroup">
          {SORTS.map((title, index) => (
            <RadioRow
              key={title}
              title={title}
              selected={sort === title}
              disabled={index === SORTS.length - 1}
              onSelect={() => setSort(title)}
            />
          ))}
        </RowGroup>
      </GalleryItem>
      <GalleryItem label="In a card, with a description">
        <RowGroup accessibilityRole="radiogroup">
          <RadioRow
            title="Home"
            description="House 12, Road 5, Dhanmondi, Dhaka"
            selected
            onSelect={() => {}}
          />
          <RadioRow
            title="Office"
            description="Level 4, 22 Gulshan Avenue, Dhaka"
            selected={false}
            onSelect={() => {}}
          />
        </RowGroup>
      </GalleryItem>
    </GallerySection>
  );
}

// Swatch colours are content: the store sends each one with its name.
const COLOURS = [
  { name: 'Black', hex: '#1c1c1c' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Blue', hex: '#4a74e0' },
];

function CheckRows() {
  const [chosen, setChosen] = useState<string[]>(['Black']);
  const [remember, setRemember] = useState(false);
  const toggle = (name: string) =>
    setChosen((now) => (now.includes(name) ? now.filter((n) => n !== name) : [...now, name]));

  return (
    <GallerySection title="Check rows">
      <GalleryItem label="With swatches (Filter → Colour): checked, unchecked">
        <RowGroup card={false}>
          {COLOURS.map((colour) => (
            <CheckRow
              key={colour.name}
              title={colour.name}
              swatch={colour.hex}
              checked={chosen.includes(colour.name)}
              onCheckedChange={() => toggle(colour.name)}
            />
          ))}
        </RowGroup>
      </GalleryItem>
      <GalleryItem label="Without a swatch; disabled">
        <RowGroup>
          <CheckRow title="Remember me" checked={remember} onCheckedChange={setRemember} />
          <CheckRow title="Gift wrap" checked disabled onCheckedChange={() => {}} />
        </RowGroup>
      </GalleryItem>
    </GallerySection>
  );
}

function SwitchRows() {
  const [orders, setOrders] = useState(true);
  const [deals, setDeals] = useState(false);

  return (
    <GallerySection title="Switch rows">
      <GalleryItem label="In a card (Preferences): on, off, disabled">
        <RowGroup>
          <SwitchRow
            title="Order Updates"
            description="Get notified about your order status changes."
            value={orders}
            onValueChange={setOrders}
          />
          <SwitchRow
            title="Price Drop Alerts"
            description="Get notified when items in your wishlist go on sale again."
            value={deals}
            onValueChange={setDeals}
          />
          <SwitchRow
            title="Two-Factor Authentication"
            description="Add an extra layer of security to your account"
            value
            disabled
            onValueChange={() => {}}
          />
        </RowGroup>
      </GalleryItem>
    </GallerySection>
  );
}

function Switches() {
  const [on, setOn] = useState(true);

  return (
    <GallerySection title="Switch">
      <GalleryItem label="On, off, disabled on, disabled off">
        <View className="flex-row items-center gap-6">
          <Switch accessibilityLabel="Sample on" value={on} onValueChange={setOn} />
          <Switch accessibilityLabel="Sample off" value={false} />
          <Switch accessibilityLabel="Sample disabled on" value disabled />
          <Switch accessibilityLabel="Sample disabled off" value={false} disabled />
        </View>
      </GalleryItem>
    </GallerySection>
  );
}

function Steppers() {
  const [quantity, setQuantity] = useState(1);

  return (
    <GallerySection title="Quantity stepper">
      <GalleryItem label="Live (cart line, 1 to 5): the bin at 1 removes the line">
        <View className="flex-row items-center gap-3">
          <Stepper
            value={quantity}
            max={5}
            removable
            onChange={setQuantity}
            onRemove={() => setQuantity(1)}
          />
          <Text variant="caption">max 5</Text>
        </View>
      </GalleryItem>
      <GalleryItem label="Cart line at 1: the bin">
        <Stepper value={1} max={10} removable onRemove={() => {}} onChange={() => {}} />
      </GalleryItem>
      <GalleryItem label="At the store's least (1, not removable): minus is off">
        <Stepper value={1} max={10} onChange={() => {}} />
      </GalleryItem>
      <GalleryItem label="Between: 3 of 10">
        <Stepper value={3} max={10} removable onChange={() => {}} />
      </GalleryItem>
      <GalleryItem label="At the store's most (5 of 5): plus is off">
        <Stepper value={5} max={5} removable onChange={() => {}} />
      </GalleryItem>
      <GalleryItem label="Busy: a change is on its way">
        <Stepper value={2} max={10} removable busy onChange={() => {}} />
      </GalleryItem>
      <GalleryItem label="Product page">
        <Stepper variant="product" value={quantity} max={5} onChange={setQuantity} />
      </GalleryItem>
    </GallerySection>
  );
}

import { View, type TextInputProps } from 'react-native';
import { useTranslations } from 'use-intl';

import { TextField } from '@/components/ui/text-field';
import type { CheckoutForm } from '@/contracts/mobile/shop/v1';

import { FormCard } from './checkout-sections';
import type { GuestAddress } from './use-checkout';

/** The store's error for a field (`fieldErrors` key), once the shopper may see it. */
export type ErrorOf = (key: string) => string | undefined;

type ContactProps = {
  contactMode: CheckoutForm['contactMode'];
  email: string;
  phone: string;
  onEmail: (email: string) => void;
  onPhone: (phone: string) => void;
  errorOf: ErrorOf;
  onLeave: (key: string) => void;
};

/** "Contact", for guests only: the email the store writes to, and a phone. */
export function ContactCard({
  contactMode,
  email,
  phone,
  onEmail,
  onPhone,
  errorOf,
  onLeave,
}: ContactProps) {
  const t = useTranslations('checkout');
  const tAuth = useTranslations('auth');
  const emailRequired = contactMode !== 'phone';
  const phoneRequired = contactMode === 'phone' || contactMode === 'email_and_phone';

  return (
    <FormCard>
      <TextField
        label={t('email')}
        required={emailRequired}
        optional={!emailRequired}
        value={email}
        onChangeText={onEmail}
        onBlur={() => onLeave('email')}
        error={errorOf('email')}
        hint={t('emailHint')}
        placeholder={tAuth('emailPlaceholder')}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <TextField
        label={t('phone')}
        required={phoneRequired}
        optional={!phoneRequired}
        value={phone}
        onChangeText={onPhone}
        onBlur={() => onLeave('phone')}
        error={errorOf('phone')}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
    </FormCard>
  );
}

/** The address form's rows: names side by side, and the city beside its postal code. */
const ADDRESS_ROWS: (keyof GuestAddress)[][] = [
  ['firstName', 'lastName'],
  ['street'],
  ['apartment'],
  ['city', 'postalCode'],
  ['state'],
  ['country'],
];
/** The store always asks for these; it says whether it wants the others. */
const ALWAYS_REQUIRED = new Set<keyof GuestAddress>(['street', 'city', 'country']);

/** What the phone's autofill and keyboard know each field as. */
const ADDRESS_INPUT: Record<keyof GuestAddress, TextInputProps> = {
  firstName: { autoComplete: 'given-name', textContentType: 'givenName', autoCapitalize: 'words' },
  lastName: { autoComplete: 'family-name', textContentType: 'familyName', autoCapitalize: 'words' },
  street: { autoComplete: 'address-line1', textContentType: 'streetAddressLine1' },
  apartment: { autoComplete: 'address-line2', textContentType: 'streetAddressLine2' },
  city: { autoComplete: 'postal-address-locality', textContentType: 'addressCity' },
  state: { autoComplete: 'postal-address-region', textContentType: 'addressState' },
  postalCode: { autoComplete: 'postal-code', textContentType: 'postalCode' },
  country: { autoComplete: 'country', textContentType: 'countryName' },
};

type GuestAddressProps = {
  fields: CheckoutForm['addressFields'];
  address: GuestAddress;
  onChange: (field: keyof GuestAddress, value: string) => void;
  errorOf: ErrorOf;
  onLeave: (key: string) => void;
};

/** The delivery address a guest types in place of the address book, as the store's form asks for it. */
export function GuestAddressForm({
  fields,
  address,
  onChange,
  errorOf,
  onLeave,
}: GuestAddressProps) {
  const t = useTranslations('addresses');

  const fieldOf = (field: keyof GuestAddress) => {
    const asked = fields[field];
    const required = ALWAYS_REQUIRED.has(field) || asked?.visibility === 'required';
    const key = `shippingAddress.${field}`;
    // The store puts a missing name on `fullName`: it belongs to the first name.
    const error =
      errorOf(key) ?? (field === 'firstName' ? errorOf('shippingAddress.fullName') : undefined);
    return (
      <TextField
        key={field}
        className="flex-1"
        label={asked?.label ?? t(`fields.${field}`)}
        required={required}
        optional={!required}
        value={address[field]}
        onChangeText={(value) => onChange(field, value)}
        onBlur={() => {
          onLeave(key);
          if (field === 'firstName') onLeave('shippingAddress.fullName');
        }}
        error={error}
        {...ADDRESS_INPUT[field]}
      />
    );
  };

  return (
    <FormCard>
      {ADDRESS_ROWS.map((row) => {
        const shown = row.filter((field) => fields[field]?.visibility !== 'hidden');
        if (shown.length === 0) return null;
        return (
          <View key={row.join()} className="flex-row gap-3">
            {shown.map(fieldOf)}
          </View>
        );
      })}
    </FormCard>
  );
}

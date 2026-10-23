import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { SelectField } from '@/components/ui/select-field';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { ManualOrderAddressRequest, ManualOrderFormOptions } from '@/contracts/mobile/biz/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * A refusal in the words of creating an order: the store's reasons that mean
 * something else here (`orders.create.reasons`), else the app's usual sentence.
 */
export function useCreationErrorMessage(): (error: unknown) => string {
  const t = useTranslations('orders.create.reasons');
  const describe = useErrorMessage();
  return (error) => {
    // The key is built from what the store sent, so it cannot be typed.
    const reason = (isApiError(error) ? error.reason : undefined) as never;
    return reason && t.has(reason) ? t(reason) : describe(error);
  };
}

/** Invalid raw input remains visible and makes contract validation fail. */
export function CreationNumber({
  label,
  value,
  onChange,
  disabled,
  integer = false,
  optional = false,
  unit,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
  integer?: boolean;
  optional?: boolean;
  /** Drawn at the end of the box: the currency's code, "%". */
  unit?: string;
}) {
  const t = useTranslations('orders.create');
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (!Object.is(emitted.current, value)) {
      emitted.current = value;
      setText(value === undefined ? '' : String(value));
    }
  }, [value]);
  return (
    <TextField
      label={label}
      value={text}
      editable={!disabled}
      optional={optional}
      keyboardType={integer ? 'number-pad' : 'decimal-pad'}
      inputMode={integer ? 'numeric' : 'decimal'}
      error={Number.isNaN(value) ? t('invalidNumber') : undefined}
      end={
        unit ? (
          <Text variant="meta" className="pe-3">
            {unit}
          </Text>
        ) : undefined
      }
      onChangeText={(next) => {
        setText(next);
        const number =
          next.trim() === '' && optional
            ? undefined
            : /^\d+(?:\.\d*)?$/.test(next.trim())
              ? Number(next)
              : Number.NaN;
        const parsed =
          number !== undefined && integer && !Number.isInteger(number) ? Number.NaN : number;
        emitted.current = parsed;
        onChange(parsed);
      }}
    />
  );
}

/** An address as the operator writes it; the contract says what it needs. */
export function CreationAddress({
  value,
  options,
  onChange,
  disabled,
  billing = false,
}: {
  value?: Partial<ManualOrderAddressRequest>;
  options: ManualOrderFormOptions;
  onChange: (value: Partial<ManualOrderAddressRequest>) => void;
  disabled?: boolean;
  billing?: boolean;
}) {
  const t = useTranslations('orders.create');
  const field = (
    key: 'name' | 'street' | 'apartment' | 'city' | 'state' | 'postalCode' | 'phone',
    extra: { placeholder?: string } = {}
  ) => {
    const required = ['name', 'street', 'city'].includes(key);
    return (
      <TextField
        key={key}
        label={t(`${billing ? 'billing' : 'address'}.${key}`)}
        value={value?.[key] ?? ''}
        editable={!disabled}
        required={required}
        optional={!required}
        placeholder={extra.placeholder}
        autoComplete={
          key === 'name'
            ? 'name'
            : key === 'street'
              ? 'street-address'
              : key === 'postalCode'
                ? 'postal-code'
                : key === 'phone'
                  ? 'tel'
                  : undefined
        }
        keyboardType={key === 'phone' ? 'phone-pad' : undefined}
        maxLength={key === 'street' ? 500 : key === 'phone' ? 50 : 200}
        onChangeText={(text) => onChange({ ...value, [key]: text })}
      />
    );
  };
  return (
    <View className="gap-5">
      {field('name')}
      {field('street', { placeholder: t('streetPlaceholder') })}
      {field('apartment')}
      {field('city')}
      {field('state')}
      {field('postalCode')}
      <SelectField
        label={t(billing ? 'billingCountry' : 'country')}
        required
        value={value?.country ?? ''}
        choices={options.countries.map((country) => ({ value: country.code, label: country.name }))}
        disabled={disabled}
        onChange={(country) => onChange({ ...value, country })}
      />
      {field('phone')}
    </View>
  );
}

/** An address on one or two lines, for a summary. */
export function addressLines(
  address: Partial<ManualOrderAddressRequest>,
  countries: ManualOrderFormOptions['countries']
) {
  const country = countries.find((item) => item.code === address.country)?.name ?? address.country;
  return [
    [address.street, address.apartment].filter(Boolean).join(', '),
    [address.city, address.state, address.postalCode, country].filter(Boolean).join(', '),
  ].filter(Boolean);
}

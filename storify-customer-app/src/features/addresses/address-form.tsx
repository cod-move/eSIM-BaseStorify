import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { useBottomSpace } from '@/components/shell/tab-bar';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FieldMessage, TextField } from '@/components/ui/text-field';
import { SwitchRow } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { ADDRESS_LABELS, type Address, type AddressBook } from '@/contracts/mobile/shop/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import {
  checkForm,
  MIN_STREET,
  toForm,
  toRequest,
  useChangeAddresses,
  type AddressForm as FormValues,
  type AddressFormField,
} from './use-addresses';

const FIELDS: { field: AddressFormField; required?: boolean; keyboard?: 'phone-pad' }[] = [
  { field: 'firstName', required: true },
  { field: 'lastName' },
  { field: 'street', required: true },
  { field: 'apartment' },
  { field: 'city', required: true },
  { field: 'state' },
  { field: 'postalCode' },
  { field: 'country', required: true },
  { field: 'phone', keyboard: 'phone-pad' },
];

type AddressFormProps = {
  /** The address to edit; a new one when left out. */
  address?: Address;
  /** The store took it: here is the whole book. */
  onSaved: (book: AddressBook) => void;
};

/**
 * The address form, for the address book and for checkout. It checks what
 * checkout requires (a name, a street of five characters or more) before
 * sending, and shows under each field what the store refuses.
 */
export function AddressForm({ address, onSaved }: AddressFormProps) {
  const t = useTranslations('addresses');
  const errorMessage = useErrorMessage();
  const bottom = useBottomSpace();
  const change = useChangeAddresses();
  const [form, setForm] = useState<FormValues>(() => toForm(address));
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? false);
  const [tried, setTried] = useState(false);

  const problems = tried ? checkForm(form) : {};
  const refused = isApiError(change.error) ? change.error.errors : undefined;
  const fieldError = (field: AddressFormField) => {
    const problem = problems[field];
    if (problem === 'streetTooShort') return t('problem.streetTooShort', { min: MIN_STREET });
    if (problem) return t('problem.required');
    return refused?.[field]?.[0];
  };

  const save = () => {
    setTried(true);
    if (Object.keys(checkForm(form)).length > 0) return;
    const request = { ...toRequest(form), ...(isDefault ? { isDefault: true } : {}) };
    change.mutate(
      address
        ? { kind: 'update', id: address.id, address: request }
        : { kind: 'create', address: request },
      { onSuccess: onSaved }
    );
  };

  return (
    <ScrollView
      contentContainerClassName="gap-4 p-4"
      contentContainerStyle={{ paddingBottom: bottom + 16 }}
      keyboardShouldPersistTaps="handled">
      <View className="gap-2">
        <Text variant="label">{t('fields.label')}</Text>
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {ADDRESS_LABELS.map((label) => (
            <Chip
              key={label}
              kind="option"
              label={t(`label.${label}`)}
              selected={form.label === label}
              accessibilityRole="radio"
              accessibilityState={{ checked: form.label === label }}
              onPress={() => setForm({ ...form, label })}
            />
          ))}
        </View>
      </View>
      {FIELDS.map(({ field, required, keyboard }) => (
        <TextField
          key={field}
          label={t(`fields.${field}`)}
          required={required}
          optional={!required}
          value={form[field]}
          onChangeText={(value) => setForm({ ...form, [field]: value })}
          error={fieldError(field)}
          keyboardType={keyboard}
          autoComplete={field === 'phone' ? 'tel' : undefined}
        />
      ))}
      {address?.isDefault ? null : (
        <SwitchRow title={t('makeDefault')} value={isDefault} onValueChange={setIsDefault} />
      )}
      {change.isError && !refused ? <FieldMessage error={errorMessage(change.error)} /> : null}
      <Button label={t('save')} loading={change.isPending} onPress={save} />
    </ScrollView>
  );
}

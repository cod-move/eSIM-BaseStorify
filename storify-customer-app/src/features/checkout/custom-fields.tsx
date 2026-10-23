import { View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { SwitchRow } from '@/components/ui/rows';
import { FieldLabel, FieldMessage, TextField } from '@/components/ui/text-field';
import type { CheckoutCustomField } from '@/contracts/mobile/shop/v1';

import { FormCard } from './checkout-sections';
import type { ErrorOf } from './guest-sections';
import type { CustomAnswers } from './use-checkout-form';

/** The keyboard for a field of this type; the usual one for any other. */
function keyboardOf(type: string) {
  switch (type) {
    case 'number':
      return 'numeric';
    case 'email':
      return 'email-address';
    case 'phone':
      return 'phone-pad';
    default:
      return undefined;
  }
}

type CustomFieldsProps = {
  /** The store's fields for one place on the form (`placement`). */
  fields: CheckoutCustomField[];
  values: CustomAnswers;
  onChange: (id: string, value: string | boolean) => void;
  errorOf: ErrorOf;
  onLeave: (key: string) => void;
};

/**
 * The store's own checkout fields, as the quote lists them: a checkbox is a
 * switch, a select a row of choices, anything else a text field. Each shows
 * the store's error for it under itself.
 */
export function CustomFields({ fields, values, onChange, errorOf, onLeave }: CustomFieldsProps) {
  const shown = fields.filter((field) => field.visibility !== 'hidden');
  if (shown.length === 0) return null;

  return (
    <FormCard>
      {shown.map((field) => {
        const key = `customFields.${field.id}`;
        const required = field.visibility === 'required';
        const value = values[field.id];
        const error = errorOf(key);

        if (field.type === 'checkbox') {
          return (
            <View key={field.id}>
              <SwitchRow
                title={field.label}
                description={field.helpText}
                value={value === true}
                onValueChange={(on) => {
                  onChange(field.id, on);
                  onLeave(key);
                }}
                className="py-0"
              />
              <FieldMessage error={error} />
            </View>
          );
        }
        if (field.type === 'select') {
          return (
            <View key={field.id} className="gap-2">
              <FieldLabel label={field.label} required={required} optional={!required} />
              <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
                {field.options.map((option) => (
                  <Chip
                    key={option}
                    kind="option"
                    label={option}
                    selected={value === option}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: value === option }}
                    onPress={() => {
                      onChange(field.id, option);
                      onLeave(key);
                    }}
                  />
                ))}
              </View>
              <FieldMessage error={error} hint={field.helpText} />
            </View>
          );
        }
        return (
          <TextField
            key={field.id}
            label={field.label}
            required={required}
            optional={!required}
            placeholder={field.placeholder}
            hint={field.helpText}
            value={typeof value === 'string' ? value : ''}
            onChangeText={(text) => onChange(field.id, text)}
            onBlur={() => onLeave(key)}
            error={error}
            multiline={field.type === 'textarea'}
            keyboardType={keyboardOf(field.type)}
          />
        );
      })}
    </FormCard>
  );
}

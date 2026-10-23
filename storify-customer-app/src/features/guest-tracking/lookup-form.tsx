import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { TrackOrderRequest } from '@/contracts/mobile/shop/v1';

import { validateLookup, type LookupErrors, type LookupValues } from './lookup';

type LookupFormProps = {
  values: LookupValues;
  onChange: (values: LookupValues) => void;
  onSubmit: (request: TrackOrderRequest) => void;
};

/** The order number and the email or phone it was placed with. */
export function LookupForm({ values, onChange, onSubmit }: LookupFormProps) {
  const t = useTranslations('trackOrder');
  const [errors, setErrors] = useState<LookupErrors>({});

  const submit = () => {
    const checked = validateLookup(values);
    if ('errors' in checked) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    onSubmit(checked.request);
  };

  return (
    <View className="gap-5">
      <Text>{t('intro')}</Text>
      <TextField
        label={t('orderNumber')}
        value={values.orderNumber}
        onChangeText={(orderNumber) => onChange({ ...values, orderNumber })}
        error={errors.orderNumber ? t(`errors.${errors.orderNumber}`) : undefined}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="next"
      />
      <TextField
        label={t('contact')}
        value={values.contact}
        onChangeText={(contact) => onChange({ ...values, contact })}
        error={errors.contact ? t(`errors.${errors.contact}`) : undefined}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        returnKeyType="send"
        onSubmitEditing={submit}
      />
      <Button variant="accent" label={t('submit')} onPress={submit} />
    </View>
  );
}

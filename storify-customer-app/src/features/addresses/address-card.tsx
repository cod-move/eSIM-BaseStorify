import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';
import type { Address } from '@/contracts/mobile/shop/v1';

/** The address's name: the app's word for a label it knows, the store's text for one it does not. */
export function useAddressName(): (address: Address) => string {
  const t = useTranslations('addresses');
  return (address) =>
    address.label === 'home' || address.label === 'work' || address.label === 'other'
      ? t(`label.${address.label}`)
      : address.label;
}

/** The address as it is printed: the name, the street, the town, the country. The API sends no lines. */
export function addressLines(address: Address): string[] {
  const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(', ');
  const town = joined(address.city, [address.state, address.postalCode].filter(Boolean).join(' '));
  return [
    [address.firstName, address.lastName].filter(Boolean).join(' '),
    joined(address.street, address.apartment),
    town,
    address.country,
  ].filter(Boolean);
}

type AddressCardProps = {
  address: Address;
  onEdit: () => void;
  onRemove: () => void;
  onSetDefault: () => void;
  /** A change to this address is on its way: its buttons wait. */
  busy?: boolean;
};

/**
 * The managed address card: the name, a divider, the lines and the phone, and
 * the actions. The default one has the "Default" pill and an accent border.
 * "Remove" asks first, in the card itself.
 */
export function AddressCard({ address, onEdit, onRemove, onSetDefault, busy }: AddressCardProps) {
  const t = useTranslations('addresses');
  const name = useAddressName()(address);
  const [confirming, setConfirming] = useState(false);

  return (
    <View
      className={cn(
        'gap-4 rounded-xl bg-surface p-6',
        address.isDefault ? 'border-2 border-accent' : 'border-2 border-transparent'
      )}>
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="subheading" className="flex-1">
          {name}
        </Text>
        {address.isDefault ? (
          <View className="rounded-full bg-accent px-3 py-1">
            <Text variant="badge" className="text-accent-foreground">
              {t('default')}
            </Text>
          </View>
        ) : null}
      </View>
      <Divider />
      <View className="gap-1">
        {addressLines(address).map((line) => (
          <Text key={line} variant="body" className="text-muted">
            {line}
          </Text>
        ))}
        {address.phone ? (
          <Text variant="body" className="text-muted">
            {address.phone}
          </Text>
        ) : null}
      </View>
      {confirming ? (
        <View className="gap-3">
          <Text variant="label">{t('confirmRemove')}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Button
              label={t('remove')}
              variant="danger"
              size="sm"
              loading={busy}
              accessibilityLabel={t('removeLabel', { name })}
              onPress={onRemove}
            />
            <Button
              label={t('cancel')}
              variant="secondary"
              size="sm"
              onPress={() => setConfirming(false)}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap items-center gap-2">
          <Button
            label={t('edit')}
            size="sm"
            accessibilityLabel={t('editLabel', { name })}
            onPress={onEdit}
          />
          <Button
            label={t('remove')}
            variant="secondary"
            size="sm"
            accessibilityLabel={t('removeLabel', { name })}
            onPress={() => setConfirming(true)}
          />
          {address.isDefault ? null : (
            <Button
              label={t('setDefault')}
              variant="ghost"
              size="sm"
              disabled={busy}
              accessibilityLabel={t('setDefaultLabel', { name })}
              onPress={onSetDefault}
            />
          )}
        </View>
      )}
    </View>
  );
}

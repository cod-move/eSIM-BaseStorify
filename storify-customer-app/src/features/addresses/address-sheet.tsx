import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radio } from '@/components/ui/rows';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { Address } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { addressLines, useAddressName } from './address-card';
import { useAddresses } from './use-addresses';

type AddressSheetProps = {
  visible: boolean;
  /** The address chosen now; the default one when left out. */
  selectedId?: string;
  onApply: (address: Address) => void;
  onAddNew: () => void;
  onClose: () => void;
};

/**
 * The address sheet of checkout: the saved addresses as selectable cards,
 * "+ Add new shipping address", and Apply pinned under them.
 */
export function AddressSheet({
  visible,
  selectedId,
  onApply,
  onAddNew,
  onClose,
}: AddressSheetProps) {
  const t = useTranslations('addresses');
  const book = useAddresses();
  const [choice, setChoice] = useState<string>();
  const chosenId = choice ?? selectedId ?? book.data?.find((a) => a.isDefault)?.id;
  const chosen = book.data?.find((a) => a.id === chosenId);

  return (
    <Sheet
      visible={visible}
      title={t('sheetTitle')}
      onClose={onClose}
      footer={
        <Button
          label={t('apply')}
          disabled={!chosen}
          onPress={() => (chosen ? onApply(chosen) : undefined)}
        />
      }>
      <View className="gap-3 px-4 pb-4" accessibilityRole="radiogroup">
        {book.isPending ? <ActivityIndicator colorClassName="accent-muted" /> : null}
        {book.data?.map((address) => (
          <SelectableAddress
            key={address.id}
            address={address}
            selected={address.id === chosenId}
            onSelect={() => setChoice(address.id)}
          />
        ))}
        <Button label={t('addShipping')} variant="outline" icon="plus" onPress={onAddNew} />
      </View>
    </Sheet>
  );
}

/** The selectable card: a pin, the name, the address, a radio at the end. */
function SelectableAddress({
  address,
  selected,
  onSelect,
}: {
  address: Address;
  selected: boolean;
  onSelect: () => void;
}) {
  const name = useAddressName()(address);
  const text = addressLines(address).join(', ');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityHint={text}
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      className={cn(
        'flex-row items-center gap-4 rounded-xl border-2 bg-surface p-6 active:opacity-70',
        selected ? 'border-accent' : 'border-transparent'
      )}>
      <Icon name="pin" size={22} colorClassName="accent-foreground" />
      <View className="flex-1 gap-1">
        <Text variant="subheading">{name}</Text>
        <Text variant="body" className="text-muted" numberOfLines={2}>
          {text}
        </Text>
      </View>
      <Radio selected={selected} />
    </Pressable>
  );
}

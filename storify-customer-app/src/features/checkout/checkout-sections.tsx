import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Radio } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import { FieldSurfaceProvider, TextField } from '@/components/ui/text-field';
import type {
  Address,
  CheckoutQuote,
  CheckoutQuoteLine,
  CheckoutShippingOption,
} from '@/contracts/mobile/shop/v1';
import { addressLines, useAddressName } from '@/features/addresses/address-card';
import { ProductLink } from '@/features/catalog/product-link';

import type { CheckoutField } from './use-checkout';

/** A section's name over its card, with a link at the other end when there is one. */
export function SectionTitle({ children, end }: { children: string; end?: ReactNode }) {
  return (
    <View className="mx-2 mt-3 flex-row items-center justify-between gap-4">
      <Text variant="heading" accessibilityRole="header" className="shrink">
        {children}
      </Text>
      {end}
    </View>
  );
}

/** A card of fields: every field inside steps down a shade so that it shows on the card. */
export function FormCard({ children }: { children: ReactNode }) {
  return (
    <FieldSurfaceProvider value="surface">
      <View className="gap-5 rounded-2xl bg-surface p-5">{children}</View>
    </FieldSurfaceProvider>
  );
}

/** The app's sentence for an error the quote put on this part of the form. */
export function FieldError({
  field,
  errors,
}: {
  field: CheckoutField;
  errors: Set<CheckoutField>;
}) {
  const t = useTranslations('checkout.errors');
  if (!errors.has(field)) return null;
  return (
    <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
      {t(field)}
    </Text>
  );
}

type AddressSectionProps = {
  address?: Address;
  errors: Set<CheckoutField>;
  note: string;
  noteShown: boolean;
  onChange: () => void;
  onNotes: () => void;
  onNote: (note: string) => void;
  noteVisible: boolean;
};

/** "Delivery location": the address, "Change location", the Notes pill and the note when the store asks for it. */
export function AddressSection({
  address,
  errors,
  note,
  noteShown,
  noteVisible,
  onChange,
  onNotes,
  onNote,
}: AddressSectionProps) {
  const t = useTranslations('checkout');
  const nameOf = useAddressName();

  return (
    <View className="gap-3 rounded-2xl bg-surface p-5">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          {address ? (
            <>
              <Text variant="subheading">{nameOf(address)}</Text>
              <Text variant="caption">{addressLines(address).join('\n')}</Text>
            </>
          ) : (
            <Text variant="caption">{t('noAddress')}</Text>
          )}
          <FieldError field="name" errors={errors} />
          <FieldError field="address" errors={errors} />
        </View>
        <Button
          label={address ? t('changeLocation') : t('chooseLocation')}
          variant="outline"
          size="sm"
          onPress={onChange}
        />
      </View>
      {noteVisible ? (
        <View className="flex-row gap-2">
          <Button label={t('notes')} variant="ghost" size="sm" icon="plus" onPress={onNotes} />
        </View>
      ) : null}
      {noteVisible && noteShown ? (
        <TextField
          label={t('noteLabel')}
          value={note}
          onChangeText={onNote}
          multiline
          on="surface"
        />
      ) : null}
      <FieldError field="note" errors={errors} />
    </View>
  );
}

type DeliveryProps = {
  shipping: CheckoutQuote['shipping'];
  errors: Set<CheckoutField>;
  onChoose: (optionId: string, vendorId?: string) => void;
};

/** "Delivery method": the options of one shipment, or each seller's own. */
export function DeliverySection({ shipping, errors, onChoose }: DeliveryProps) {
  const t = useTranslations('checkout');

  return (
    <View className="gap-1 rounded-2xl bg-surface p-3">
      {shipping.status === 'NEEDS_ADDRESS' ? (
        <Text variant="caption" className="p-2">
          {t('needsAddress')}
        </Text>
      ) : null}
      {shipping.status === 'UNAVAILABLE' ? (
        <Text variant="caption" className="p-2 text-danger">
          {t('shippingUnavailable')}
        </Text>
      ) : null}
      {shipping.options.map((option) => (
        <OptionRow
          key={option.id}
          option={option}
          selected={option.id === shipping.selectedOptionId}
          onSelect={() => onChoose(option.id)}
        />
      ))}
      {shipping.sellers.map((seller) => (
        <View key={seller.vendorId} className="gap-1">
          {seller.name ? (
            <Text variant="label" className="px-2 pt-2">
              {seller.name}
            </Text>
          ) : null}
          {seller.options.map((option) => (
            <OptionRow
              key={option.id}
              option={option}
              selected={option.id === seller.selectedOptionId}
              onSelect={() => onChoose(option.id, seller.vendorId)}
            />
          ))}
        </View>
      ))}
      <FieldError field="delivery" errors={errors} />
    </View>
  );
}

function OptionRow({
  option,
  selected,
  onSelect,
}: {
  option: CheckoutShippingOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('checkout');
  const days =
    option.minDays !== undefined && option.maxDays !== undefined
      ? t('deliveryDays', { min: option.minDays, max: option.maxDays })
      : undefined;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={[option.name, days, option.price.formatted].filter(Boolean).join(', ')}
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      className="min-h-11 flex-row items-center gap-3 rounded-xl px-2 py-2 active:opacity-70">
      <Radio selected={selected} />
      <View className="flex-1">
        <Text variant="body">{option.name}</Text>
        {days ? <Text variant="caption">{days}</Text> : null}
      </View>
      <Text variant="body">{option.price.formatted}</Text>
    </Pressable>
  );
}

/** "Items": what the order holds, at the live price, with the cart's price when it changed. */
export function ItemsSection({ lines }: { lines: CheckoutQuoteLine[] }) {
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      {lines.map((line) => (
        <ItemRow key={line.key} line={line} />
      ))}
    </View>
  );
}

function ItemRow({ line }: { line: CheckoutQuoteLine }) {
  const t = useTranslations('checkout');
  return (
    <ProductLink product={line} className="flex-row items-center gap-3">
      <AppImage image={line.image} size="thumb" className="h-14 w-14 rounded-lg" decorative />
      <View className="flex-1 gap-0.5">
        <Text variant="body" numberOfLines={2}>
          {line.name}
        </Text>
        <Text variant="caption">{t('quantity', { count: line.quantity })}</Text>
      </View>
      <View className="items-end">
        <Text variant="price">{line.lineTotal.formatted}</Text>
        {line.previousUnitPrice ? (
          <Text variant="caption">{t('was', { price: line.previousUnitPrice.formatted })}</Text>
        ) : null}
      </View>
    </ProductLink>
  );
}

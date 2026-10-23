import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Chip } from '@/components/ui/chip';
import { Stepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import type { ProductDetail, ProductOption, ProductOptionValue } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { choosableOptions, isValueAvailable, type Choice } from './purchase-state';

type ProductOptionsProps = {
  product: ProductDetail;
  choice: Choice;
  onChoose: (optionId: string, valueId: string) => void;
  quantity: number;
  onQuantity: (quantity: number) => void;
  /** The most the shopper may take; 0 hides the quantity row's buttons. */
  maxQuantity: number;
};

/**
 * The option rows and the quantity row: the option's name at
 * the start, its values at the end, wrapping onto a second line when they do
 * not fit. An option whose values all carry a colour is drawn as swatches.
 */
export function ProductOptions({
  product,
  choice,
  onChoose,
  quantity,
  onQuantity,
  maxQuantity,
}: ProductOptionsProps) {
  const t = useTranslations('product');

  return (
    <View>
      {choosableOptions(product).map((option) => (
        <OptionRow
          key={option.id}
          option={option}
          isAvailable={(value) => isValueAvailable(product, choice, option.id, value.id)}
          selectedId={choice[option.id]}
          onChoose={(valueId) => onChoose(option.id, valueId)}
        />
      ))}
      <View className="min-h-[52px] flex-row items-center justify-between gap-4 border-b border-border py-2">
        <Text variant="subheading">{t('quantity')}</Text>
        <Stepper
          value={quantity}
          onChange={onQuantity}
          max={Math.max(maxQuantity, 1)}
          disabled={maxQuantity <= 0}
        />
      </View>
    </View>
  );
}

type OptionRowProps = {
  option: ProductOption;
  selectedId: string | undefined;
  isAvailable: (value: ProductOptionValue) => boolean;
  onChoose: (valueId: string) => void;
};

function OptionRow({ option, selectedId, isAvailable, onChoose }: OptionRowProps) {
  const swatches = option.values.length > 0 && option.values.every((value) => value.swatch);
  const chosen = option.values.find((value) => value.id === selectedId);

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={option.name}
      className="min-h-[52px] flex-row items-center justify-between gap-4 border-b border-border py-2">
      <Text variant="subheading" numberOfLines={2} className="shrink">
        {chosen && swatches ? `${option.name}: ${chosen.label}` : option.name}
      </Text>
      <View className={cn('shrink flex-row flex-wrap justify-end', swatches ? 'gap-px' : 'gap-2')}>
        {option.values.map((value) =>
          swatches ? (
            <Swatch
              key={value.id}
              value={value}
              selected={value.id === selectedId}
              unavailable={!isAvailable(value)}
              onPress={() => onChoose(value.id)}
            />
          ) : (
            <Chip
              key={value.id}
              kind="option"
              label={value.label}
              selected={value.id === selectedId}
              unavailable={!isAvailable(value)}
              onPress={() => onChoose(value.id)}
            />
          )
        )}
      </View>
    </View>
  );
}

type SwatchProps = {
  value: ProductOptionValue;
  selected: boolean;
  unavailable: boolean;
  onPress: () => void;
};

/**
 * A colour swatch: a 24 pt circle with a thin ring, so white and black both
 * show on any surface. The chosen one has a primary ring with a gap around it.
 */
function Swatch({ value, selected, unavailable, onPress }: SwatchProps) {
  const t = useTranslations('catalog');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={
        unavailable ? t('unavailableOption', { label: value.label }) : value.label
      }
      accessibilityState={{ selected }}
      onPress={onPress}
      // 32 pt drawn, 44 pt to touch: the swatches stand 9 pt apart as designed.
      hitSlop={6}
      className={cn(
        'size-8 items-center justify-center rounded-full border-2 active:opacity-70',
        selected ? 'border-primary' : 'border-transparent'
      )}>
      <View
        // The colour is the store's data for this value, not a colour of the app.
        style={{ backgroundColor: value.swatch }}
        className={cn('size-6 rounded-full border border-border', unavailable && 'opacity-40')}
      />
    </Pressable>
  );
}

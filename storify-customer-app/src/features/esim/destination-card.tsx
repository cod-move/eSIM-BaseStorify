import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTranslations } from 'use-intl';

import { Price } from '@/components/ui/price';
import { Text } from '@/components/ui/text';
import type { EsimDestination } from '@/contracts/mobile/shop/v1/esim';
import { cn } from '@/lib/cn';

import { DestinationFlag } from './destination-flag';

/** A destination in a two-column grid: its flag, its name, and from what price. */
export function DestinationCard({
  destination,
  showPrice = true,
  onPress,
  className,
  style,
}: {
  destination: EsimDestination;
  showPrice?: boolean;
  onPress: () => void;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTranslations('esim');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={destination.name}
      onPress={onPress}
      style={style}
      className={cn(
        'min-h-[72px] flex-row items-center gap-3 rounded-2xl bg-background px-3 py-3 active:opacity-80',
        className
      )}>
      <DestinationFlag destination={destination} size={44} />
      <View className="flex-1 gap-0.5">
        <Text variant="subheading" numberOfLines={2}>
          {destination.name}
        </Text>
        {destination.scope === 'local' ? null : (
          <Text variant="caption" numberOfLines={1}>
            {t('countryCount', { count: destination.countries.length })}
          </Text>
        )}
        {showPrice && destination.fromPrice ? (
          <Price price={destination.fromPrice} from size="sm" />
        ) : null}
      </View>
    </Pressable>
  );
}

/** Destinations two by two. */
export function DestinationGrid({
  destinations,
  showPrice,
  onPress,
}: {
  destinations: EsimDestination[];
  showPrice?: boolean;
  onPress: (destination: EsimDestination) => void;
}) {
  return (
    <View className="flex-row flex-wrap justify-between gap-y-3">
      {destinations.map((destination) => (
        <DestinationCard
          key={`${destination.pathScope}:${destination.slug}`}
          destination={destination}
          showPrice={showPrice}
          onPress={() => onPress(destination)}
          className="w-[48.5%]"
        />
      ))}
    </View>
  );
}

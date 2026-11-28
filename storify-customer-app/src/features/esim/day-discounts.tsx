import { View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

type Tier = { minDays: number; maxDays: number; percentOff: number };

/**
 * The multi-day discounts of a day-priced plan or top-up, under its day
 * stepper: what the chosen days save, and every tier, the chosen one marked.
 * The server sends the tiers; the cart prices the line.
 */
export function DayDiscounts({
  tiers,
  days,
  maxDays,
}: {
  tiers?: Tier[];
  days: number;
  maxDays: number;
}) {
  const t = useTranslations('esim');
  if (!tiers?.length) return null;
  const now = tiers.find((tier) => days >= tier.minDays && days <= tier.maxDays);
  return (
    <View className="gap-1.5">
      <Text variant="caption" className={now ? 'font-semibold text-success' : undefined}>
        {now ? t('dayDiscountNow', { days, off: now.percentOff }) : t('dayDiscounts')}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {tiers.map((tier) => {
          const active = tier === now;
          return (
            <View
              key={`${tier.minDays}-${tier.maxDays}`}
              className={cn(
                'rounded-md border px-2 py-0.5',
                active ? 'border-success' : 'border-border'
              )}>
              <Text variant="caption" className={active ? 'font-semibold text-success' : undefined}>
                {tier.minDays === tier.maxDays
                  ? t('dayTierOne', { min: tier.minDays, off: tier.percentOff })
                  : tier.maxDays >= maxDays
                    ? t('dayTierFrom', { min: tier.minDays, off: tier.percentOff })
                    : t('dayTier', { min: tier.minDays, max: tier.maxDays, off: tier.percentOff })}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

import { View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/cn';

import type { TrackingStep, TrackingStepKey } from './parcels';

const ICONS: Record<TrackingStepKey, IconName> = {
  placed: 'receipt',
  processing: 'package',
  shipped: 'truck',
  delivered: 'delivered',
  cancelled: 'close',
};

/**
 * The tracking steps of one parcel: a
 * circle per step joined by a line, filled up to the step the parcel has
 * reached. A step shows its time only when the store gave one; the courier's
 * scans sit under "Shipped".
 */
export function TrackingSteps({ steps }: { steps: TrackingStep[] }) {
  const t = useTranslations('orders');
  const format = useFormatter();
  const when = (at: string) =>
    format.dateTime(new Date(at), { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <View>
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const stopped = step.key === 'cancelled';
        const lineDone = step.reached && steps[index + 1]?.reached;
        const time = step.at ? when(step.at) : undefined;
        const name = t(`steps.${step.key}`);

        return (
          <View key={step.key} className="flex-row gap-4">
            <View className="w-5 items-center">
              <View
                className={cn(
                  'size-5 items-center justify-center rounded-full',
                  step.reached
                    ? stopped
                      ? 'bg-danger'
                      : 'bg-primary'
                    : 'border border-border bg-surface-alt'
                )}>
                {step.reached ? (
                  <Icon
                    name={stopped ? 'close' : 'check'}
                    size={12}
                    strokeWidth={3}
                    colorClassName="accent-primary-foreground"
                  />
                ) : null}
              </View>
              {last ? null : (
                <View className={cn('w-[3px] flex-1', lineDone ? 'bg-primary' : 'bg-border')} />
              )}
            </View>

            <View className={cn('flex-1 gap-1', !last && 'min-h-16 pb-5')}>
              <View
                accessible
                accessibilityLabel={[name, t(step.reached ? 'stepReached' : 'stepAhead'), time]
                  .filter(Boolean)
                  .join(', ')}
                className="flex-row items-start gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="subheading" className={cn(stopped && 'text-danger')}>
                    {name}
                  </Text>
                  {time ? <Text variant="caption">{time}</Text> : null}
                </View>
                <Icon
                  name={ICONS[step.key]}
                  colorClassName={stopped ? 'accent-danger' : 'accent-muted'}
                />
              </View>

              {step.events.map((event) => (
                <View key={`${event.at}-${event.status}`} className="gap-0.5 pt-2">
                  <Text variant="product">
                    {event.location ? `${event.status} · ${event.location}` : event.status}
                  </Text>
                  {event.description ? <Text variant="caption">{event.description}</Text> : null}
                  <Text variant="caption">{when(event.at)}</Text>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

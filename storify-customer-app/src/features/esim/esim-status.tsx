import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Text } from '@/components/ui/text';
import { ESIM_STATUSES, type EsimTone } from '@/contracts/mobile/shop/v1/esim';
import { cn } from '@/lib/cn';

const TONES = {
  neutral: { box: 'bg-surface-alt border-surface-alt', label: 'text-foreground' },
  info: { box: 'border-accent', label: 'text-accent' },
  success: { box: 'border-success', label: 'text-success' },
  warning: { box: 'border-warning', label: 'text-warning' },
  danger: { box: 'border-danger', label: 'text-danger' },
} as const satisfies Record<EsimTone, { box: string; label: string }>;

type KnownStatus = (typeof ESIM_STATUSES)[number];
const isKnown = (status: string): status is KnownStatus =>
  (ESIM_STATUSES as readonly string[]).includes(status);

/** A small pill naming an eSIM's status in the app's own words, coloured by the store's tone. */
export function EsimStatus({
  status,
  tone,
  className,
}: {
  status: string;
  tone: EsimTone;
  className?: string;
}) {
  const t = useTranslations('esim');
  const styles = TONES[tone];

  return (
    <View
      className={cn(
        'min-h-7 items-center justify-center self-start rounded-full border px-3 py-1',
        styles.box,
        className
      )}>
      <Text variant="caption" className={cn('font-semibold', styles.label)} numberOfLines={1}>
        {isKnown(status) ? t(`status.${status}`) : t('status.other')}
      </Text>
    </View>
  );
}

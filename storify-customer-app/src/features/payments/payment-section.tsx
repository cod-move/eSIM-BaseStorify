import { Pressable, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Icon, type IconName } from '@/components/ui/icon';
import { Radio, RowGroup } from '@/components/ui/rows';
import { Text } from '@/components/ui/text';
import type { CheckoutPaymentMethod } from '@/contracts/mobile/shop/v1';
import { cn } from '@/lib/cn';

import { useResumePayment } from './use-place-order';

export type PaymentSectionProps = {
  /** The quote's payment methods, each saying whether it can take this order. */
  methods: CheckoutPaymentMethod[];
  /** The method the shopper has chosen; none is shown chosen until they pick one. */
  value?: CheckoutPaymentMethod['id'];
  onChange: (method: CheckoutPaymentMethod['id']) => void;
  /** An order is being placed: the choice is locked. The summary's button places it. */
  busy: boolean;
};

// The app's own face for each method: the store sends only the id.
const ICONS: Record<CheckoutPaymentMethod['flow'], IconName> = {
  cod: 'cash',
  card: 'card',
  redirect: 'card',
  push: 'phone',
};

type Translate = ReturnType<typeof useTranslations<'payments'>>;

/**
 * Why a method cannot take this order. The two limits are said in the store's
 * words when it sent them: they carry the amount, which the app never formats.
 */
function unavailableText(method: CheckoutPaymentMethod, t: Translate): string | null {
  if (method.available) return null;
  const limit = method.reason === 'BELOW_MINIMUM' || method.reason === 'ABOVE_MAXIMUM';
  if (limit && method.message) return method.message;
  // The keys are built from what the store sent, so they cannot be typed.
  const key = `reason.${method.reason}` as never;
  if (method.reason && t.has(key)) return t(key);
  return method.message ?? t('unavailable');
}

type MethodRowProps = {
  method: CheckoutPaymentMethod;
  selected: boolean;
  locked: boolean;
  onSelect: () => void;
  t: Translate;
};

/** One method: its logo, its name and a radio; chosen, it opens to say what happens next. */
function MethodRow({ method, selected, locked, onSelect, t }: MethodRowProps) {
  const name = method.name;
  const reason = unavailableText(method, t);
  const note =
    selected && method.available ? t(method.id === 'cod' ? 'codNote' : 'cardNote') : null;

  return (
    <View>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={name}
        accessibilityHint={reason ?? undefined}
        accessibilityState={{ checked: selected, disabled: !method.available || locked }}
        disabled={!method.available || locked}
        onPress={onSelect}
        className={cn(
          'min-h-[52px] flex-row items-center gap-3 py-3.5 active:opacity-70',
          !method.available && 'opacity-50'
        )}>
        <View className="size-[38px] items-center justify-center rounded-md border border-border">
          <Icon name={ICONS[method.flow]} size={22} />
        </View>
        <View className="flex-1 gap-1">
          <Text variant="subheading">{name}</Text>
          {reason ? (
            <Text variant="body" className="text-muted">
              {reason}
            </Text>
          ) : null}
        </View>
        <Radio selected={selected} />
      </Pressable>
      {note ? (
        // Under the name: the logo's 38 pt and the row's 12 pt gap in.
        <Text variant="body" className="ps-[50px] pb-4 text-muted">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The payment step of checkout: the
 * methods the quote lists, in one group, the chosen one open. A method that
 * cannot take this order stays in the list, greyed, with the reason.
 */
export function PaymentSection({ methods, value, onChange, busy }: PaymentSectionProps) {
  const t = useTranslations('payments');
  // A card payment left unfinished is picked up before a new one is started.
  useResumePayment();

  if (methods.length === 0) return null;

  return (
    <RowGroup accessibilityRole="radiogroup" accessibilityLabel={t('title')}>
      {methods.map((method) => (
        <MethodRow
          key={method.id}
          method={method}
          selected={method.id === value}
          locked={busy}
          onSelect={() => onChange(method.id)}
          t={t}
        />
      ))}
    </RowGroup>
  );
}

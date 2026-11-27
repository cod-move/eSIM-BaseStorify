import { useEffect } from 'react';
import { useTranslations } from 'use-intl';

import type { CheckoutPaymentMethod } from '@/contracts/mobile/shop/v1';
import { MethodRow, type MethodRowProps } from '@/features/payments/payment-section';

import { chooseExtension, useChosenExtension, type ExtensionChoice } from './extension-choice';

/**
 * Checkout's eSIM payment methods, one row each (APP-09, patch P24): the
 * quote's "extension" method with an option per gateway. The order is placed
 * as "extension" whichever row is chosen; the row is remembered
 * (./extension-choice.ts) and paid that way by `payByRedirect`.
 */

/** The row chosen now: the one picked, else the first, while "extension" is the method chosen. */
export function useEsimMethodChoice(methods: CheckoutPaymentMethod[], value: string | undefined) {
  const chosen = useChosenExtension();
  const options = methods.find((method) => method.id === 'extension')?.options ?? [];
  const valid = chosen && options.some((option) => option.code === chosen.code) ? chosen : null;
  const first = options[0];
  const fallback =
    value === 'extension' && !valid && first
      ? { code: first.code, native: first.native, kind: first.nativeKind }
      : null;
  useEffect(() => {
    if (fallback) chooseExtension(fallback);
  }, [fallback?.code, fallback?.native, fallback?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return valid ?? fallback;
}

/** The rows themselves, as an array so the group draws its lines between them. */
export function esimMethodRows(
  method: CheckoutPaymentMethod,
  props: Omit<MethodRowProps, 'method' | 'selected' | 'onSelect' | 'image' | 'noteText'> & {
    selected: boolean;
    chosen: ExtensionChoice | null;
    onSelect: () => void;
    inAppNote: string;
    sheetNote: string;
  }
) {
  const { selected, chosen, onSelect, inAppNote, sheetNote, ...rest } = props;
  return (method.options ?? []).map((option) => (
    <MethodRow
      key={`extension:${option.code}`}
      {...rest}
      method={{ ...method, name: option.name }}
      image={option.icon}
      noteText={option.nativeKind === 'sheet' ? sheetNote : option.native ? inAppNote : undefined}
      selected={selected && chosen?.code === option.code}
      onSelect={() => {
        chooseExtension({ code: option.code, native: option.native, kind: option.nativeKind });
        onSelect();
      }}
    />
  ));
}

/** The notes under a row paid in the app: the crypto screen's, the sheet's. */
export function useInAppNotes() {
  const t = useTranslations('esim');
  return { inAppNote: t('payInAppNote'), sheetNote: t('paySheetNote') };
}

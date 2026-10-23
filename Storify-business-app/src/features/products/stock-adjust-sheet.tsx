import { onlineManager } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { useTranslations } from 'use-intl';

import { isFinal } from '@/api/attempt';
import { isNetworkError } from '@/api/errors';
import { AlreadySending, AttemptAbandoned } from '@/api/keyed-mutation';
import { Banner } from '@/components/ui/banner';
import { IconButton } from '@/components/ui/icon-button';
import { RadioRow, RowGroup } from '@/components/ui/rows';
import { ConfirmSheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField, fieldBoxClass } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import type { StockAdjustmentRequest, StockLocation } from '@/contracts/mobile/biz/v1';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { readUnits } from './typed-input';
import { useStockAdjustment } from './use-products';

type Reason = StockAdjustmentRequest['reason'];

/** The reasons offered, by direction: a delivery only comes in, damage only goes out. */
const REASONS: Record<'add' | 'remove', readonly Reason[]> = {
  add: ['received', 'count', 'correction', 'other'],
  remove: ['damaged', 'count', 'correction', 'other'],
};

/** The most units one adjustment may move (the contract's limit). */
const MAX_UNITS = 100_000;

/** Where units are added or taken away: one location of the product, or of one of its variants. */
export type AdjustTarget = {
  direction: 'add' | 'remove';
  location: StockLocation;
  variantId?: string;
  variantName?: string;
};

type StockAdjustSheetProps = {
  productId: string;
  /** Kept while the sheet slides out, so it does not empty as it goes. */
  target: AdjustTarget | null;
  visible: boolean;
  onClose: () => void;
};

/**
 * Adds or removes units at one location: a stepper, a
 * reason and an optional note, then Confirm. A tap goes with one
 * `Idempotency-Key`, kept for its retries and for "Try again" while this
 * opening of the sheet lasts (`useStockAdjustment`, by the opening's `draft`).
 *
 * When no answer comes back the change may have been made. The sheet then
 * stays as it is, locked, and offers to try again: the same request with the
 * same key, which the store counts once. Closing it gives the change up; the
 * stock screen under it has been read again meanwhile, so it shows whether
 * the change went through, and the next opening is a new change, counted
 * again. The figures on the screen change only from the store's answer.
 */
export function StockAdjustSheet({ productId, target, visible, onClose }: StockAdjustSheetProps) {
  const t = useTranslations('products');
  const common = useTranslations('common');
  const toast = useToast();
  const describe = useErrorMessage();
  const adjust = useStockAdjustment(productId);
  const [draft, setDraft] = useState(() => Crypto.randomUUID());
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState('');
  // No answer to the last tap: only the same change may be sent again.
  const [unanswered, setUnanswered] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(Crypto.randomUUID());
      setQuantity('1');
      setReason(null);
      setNote('');
      setUnanswered(false);
    }
  }

  if (!target) return null;
  const { direction, location } = target;
  const units = readUnits(quantity);
  const count = units !== null && units >= 1 && units <= MAX_UNITS ? units : null;
  const place = target.variantName
    ? t('adjust.variantPlace', { variant: target.variantName, location: location.name })
    : location.name;
  const locked = unanswered || adjust.isPending;
  const step = (by: number) =>
    setQuantity(String(Math.min(MAX_UNITS, Math.max(1, (count ?? 0) + by))));

  async function confirm() {
    if (!count || !reason || !target) return;
    const adjustment: StockAdjustmentRequest = {
      locationId: location.locationId,
      ...(target.variantId ? { variantId: target.variantId } : {}),
      delta: direction === 'add' ? count : -count,
      reason,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    // Read before the tap goes: the phone can lose its connection between the
    // tap's tries, after the store has already made the change.
    const online = onlineManager.isOnline();
    try {
      await adjust.submit({ adjustment, draft });
      toast.show({
        message: t(direction === 'add' ? 'adjust.added' : 'adjust.removed', {
          count,
          location: location.name,
        }),
        tone: 'success',
      });
      onClose();
    } catch (error) {
      if (error instanceof AlreadySending || error instanceof AttemptAbandoned) return;
      if (isNetworkError(error) && !online) {
        toast.show({ message: common('notSentOffline'), tone: 'offline' });
      } else if (!isFinal(error)) {
        // The store has not answered for this tap's key (no answer, a server fault, the
        // first try still running, or a refusal checked before the key): the units may
        // have been counted. Only this very change may go again, with its key.
        setUnanswered(true);
        if (!isNetworkError(error)) toast.show({ message: describe(error), tone: 'danger' });
      } else {
        toast.show({ message: describe(error), tone: 'danger' });
      }
    }
  }

  return (
    <ConfirmSheet
      visible={visible}
      title={t(direction === 'add' ? 'adjust.addTitle' : 'adjust.removeTitle')}
      body={t('adjust.where', { place, count: location.available })}
      confirmLabel={
        unanswered
          ? common('retry')
          : t(direction === 'add' ? 'adjust.addConfirm' : 'adjust.removeConfirm', {
              count: count ?? 0,
            })
      }
      cancelLabel={t('adjust.cancel')}
      onConfirm={() => void confirm()}
      onCancel={onClose}
      loading={adjust.isPending}
      confirmDisabled={!count || !reason}>
      <View className="gap-5">
        {unanswered ? <Banner tone="warning" message={t('adjust.noAnswer')} /> : null}

        <View className="gap-2">
          <Text variant="section">{t('adjust.quantity')}</Text>
          <View className="flex-row items-center justify-center gap-4">
            <IconButton
              icon="minus"
              label={t('adjust.fewer')}
              disabled={locked || (count ?? 0) <= 1}
              onPress={() => step(-1)}
            />
            <UnitsField
              label={t('adjust.quantity')}
              value={quantity}
              onChangeText={setQuantity}
              editable={!locked}
            />
            <IconButton
              icon="plus"
              label={t('adjust.more')}
              disabled={locked || (count ?? 0) >= MAX_UNITS}
              onPress={() => step(1)}
            />
          </View>
          {direction === 'remove' && count !== null && count > location.available ? (
            <Text variant="caption" className="text-center">
              {t('adjust.belowZero', { count: location.available })}
            </Text>
          ) : null}
        </View>

        <View className="gap-1">
          <Text variant="section">{t('adjust.reason')}</Text>
          <RowGroup bare accessibilityRole="radiogroup">
            {REASONS[direction].map((value) => (
              <RadioRow
                key={value}
                title={t(`adjust.reasons.${value}`)}
                description={t(`adjust.reasonHints.${value}`)}
                selected={reason === value}
                onSelect={() => setReason(value)}
                disabled={locked}
                className="px-0"
              />
            ))}
          </RowGroup>
        </View>

        <TextField
          label={t('adjust.note')}
          value={note}
          onChangeText={setNote}
          editable={!locked}
          maxLength={500}
          optional
        />
      </View>
    </ConfirmSheet>
  );
}

type UnitsFieldProps = {
  /** What a screen reader calls it; the section label above says it on screen. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  editable: boolean;
};

/** The count between the stepper's buttons: the number pad, a large figure in the middle. */
function UnitsField({ label, value, onChangeText, editable }: UnitsFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View className={cn(fieldBoxClass({ on: 'surface', focused, disabled: !editable }), 'w-32')}>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        selectTextOnFocus
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColorClassName="accent-accent"
        // `min-w-0`: a browser's input is otherwise as wide as twenty characters.
        className={cn(
          'min-w-0 flex-1 px-2 py-2 text-center text-2xl font-bold text-foreground tabular-nums',
          Platform.OS === 'web' && 'outline-none'
        )}
      />
    </View>
  );
}

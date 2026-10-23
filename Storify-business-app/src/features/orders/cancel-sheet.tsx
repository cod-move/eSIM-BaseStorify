import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { RadioRow, RowGroup } from '@/components/ui/rows';
import { ConfirmSheet } from '@/components/ui/sheet';
import { TextField } from '@/components/ui/text-field';

import type { StepOutcome } from './use-order-steps';

const REASONS = ['customer', 'stock', 'address', 'fraud', 'other'] as const;
type CancelReason = (typeof REASONS)[number];

type CancelSheetProps = {
  visible: boolean;
  /** The order's number, for the question. */
  number: string;
  /** One seller's part of a split order, by the seller's name; the whole order when left out. */
  part?: string;
  sending: boolean;
  /** With the reason in words, as the store keeps it on the order's timeline. */
  onConfirm: (reason: string) => Promise<StepOutcome>;
  onClose: () => void;
};

/**
 * Cancelling asks first, and asks why: a reason sheet whose button
 * waits for a reason, "Another reason" asking for the words. The words go to
 * the store, which keeps them on the order's timeline. The app never refunds:
 * an order that took money offers no cancel here (the website cancels it).
 *
 * Offline, nothing was sent: the sheet stays as it is, to be confirmed again.
 * When no answer comes back the order may have been cancelled: the sheet
 * stays, locked, and offers to try again, the same request with the same key,
 * which the store takes once. (The design system's `ReasonSheet` cannot lock
 * its reasons, so the sheet is drawn here, in the same shape.)
 */
export function CancelSheet({
  visible,
  number,
  part,
  sending,
  onConfirm,
  onClose,
}: CancelSheetProps) {
  const t = useTranslations('orders.cancel');
  const steps = useTranslations('orders.steps');
  const common = useTranslations('common');
  const [reason, setReason] = useState<CancelReason | null>(null);
  const [note, setNote] = useState('');
  // No answer to the last tap: only the same request may be sent again.
  const [unanswered, setUnanswered] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // Opened again, it starts empty.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setReason(null);
      setNote('');
      setUnanswered(false);
    }
  }

  const locked = unanswered || sending;
  const words = reason === 'other' ? note.trim() : reason ? t(`reasons.${reason}`) : '';

  const confirm = async () => {
    const outcome = await onConfirm(words);
    if (outcome.kind === 'unanswered') setUnanswered(true);
  };

  return (
    <ConfirmSheet
      visible={visible}
      title={part ? t('partTitle', { seller: part, number }) : t('title', { number })}
      body={part ? t('partBody') : t('body')}
      confirmLabel={unanswered ? common('retry') : part ? t('partConfirm') : t('confirm')}
      cancelLabel={t('keep')}
      tone="danger"
      loading={sending}
      confirmDisabled={!words}
      onCancel={onClose}
      onConfirm={() => void confirm()}>
      <View className="gap-4">
        {unanswered ? <Banner tone="warning" message={steps('noAnswer')} /> : null}
        <RowGroup bare accessibilityRole="radiogroup">
          {REASONS.map((value) => (
            <RadioRow
              key={value}
              title={t(`reasons.${value}`)}
              selected={value === reason}
              onSelect={() => setReason(value)}
              disabled={locked}
              className="px-0"
            />
          ))}
        </RowGroup>
        {reason === 'other' ? (
          <TextField
            label={t('note')}
            value={note}
            onChangeText={setNote}
            editable={!locked}
            maxLength={500}
            multiline
          />
        ) : null}
      </View>
    </ConfirmSheet>
  );
}

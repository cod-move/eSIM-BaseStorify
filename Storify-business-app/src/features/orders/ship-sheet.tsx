import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';

import type { StepOutcome, TrackingFields } from './use-order-steps';

/** The API's longest carrier and tracking number. */
const FIELD_MAX = 100;

type ShipSheetProps = {
  visible: boolean;
  /** "Mark as shipped" is on its way: the button spins and the sheet stays. */
  sending: boolean;
  onSubmit: (tracking: { carrier: string; trackingNumber: string }) => Promise<StepOutcome>;
  onClose: () => void;
};

/**
 * "Mark as shipped" asks for the carrier and the tracking number,
 * both required, as the store requires them. A field the store still finds
 * missing (`TRACKING_REQUIRED`) is marked under it. Reference: Shop's "Edit
 * tracking details" sheet.
 *
 * Offline, nothing was sent: the sheet stays as it is, to be sent again. When
 * no answer comes back the order may have been marked shipped: the sheet stays,
 * locked, and offers to try again, the same request with the same key, which
 * the store takes once.
 */
export function ShipSheet({ visible, sending, onSubmit, onClose }: ShipSheetProps) {
  const t = useTranslations('orders.ship');
  const steps = useTranslations('orders.steps');
  const common = useTranslations('common');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [missing, setMissing] = useState<TrackingFields>({});
  const [checked, setChecked] = useState(false);
  // No answer to the last tap: only the same request may be sent again.
  const [unanswered, setUnanswered] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // Opened again, it starts empty.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setCarrier('');
      setTrackingNumber('');
      setMissing({});
      setChecked(false);
      setUnanswered(false);
    }
  }

  const locked = unanswered || sending;

  // After the first try, a field's error follows what is typed.
  const recheck = (next: { carrier: string; trackingNumber: string }) => {
    if (checked)
      setMissing({ carrier: !next.carrier.trim(), trackingNumber: !next.trackingNumber.trim() });
  };

  const submit = async () => {
    const empty = { carrier: !carrier.trim(), trackingNumber: !trackingNumber.trim() };
    setChecked(true);
    setMissing(empty);
    if (empty.carrier || empty.trackingNumber) return;
    const outcome = await onSubmit({
      carrier: carrier.trim(),
      trackingNumber: trackingNumber.trim(),
    });
    if (outcome.kind === 'unanswered') setUnanswered(true);
    if (outcome.kind === 'fields') {
      // The store answered: the fields are the operator's again.
      setUnanswered(false);
      setMissing(outcome.fields);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={t('title')}
      onClose={sending ? () => undefined : onClose}
      footer={
        <Button
          label={unanswered ? common('retry') : t('submit')}
          variant="accent"
          loading={sending}
          onPress={() => void submit()}
        />
      }>
      <View className="gap-4">
        {unanswered ? <Banner tone="warning" message={steps('noAnswer')} /> : null}
        <Text className="text-muted">{t('body')}</Text>
        <TextField
          label={t('carrier')}
          hint={t('carrierHint')}
          value={carrier}
          onChangeText={(text) => {
            setCarrier(text);
            recheck({ carrier: text, trackingNumber });
          }}
          error={missing.carrier ? t('carrierMissing') : undefined}
          maxLength={FIELD_MAX}
          autoCapitalize="words"
          returnKeyType="next"
          editable={!locked}
          required
        />
        <TextField
          label={t('trackingNumber')}
          value={trackingNumber}
          onChangeText={(text) => {
            setTrackingNumber(text);
            recheck({ carrier, trackingNumber: text });
          }}
          error={missing.trackingNumber ? t('trackingMissing') : undefined}
          maxLength={FIELD_MAX}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          editable={!locked}
          required
        />
      </View>
    </Sheet>
  );
}

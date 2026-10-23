import { useTranslations } from 'use-intl';

import { ChoiceCards, Disclosure, FormGroup } from '@/components/ui/form-sections';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type { ManualOrderFormOptions } from '@/contracts/mobile/biz/v1';

import { CreationNumber } from './controls';
import type { CreationDraft } from './draft';

/** How the customer pays, the order's own charges and discount, and a note. */
export function CreationPayment({
  draft,
  options,
  onChange,
  disabled,
}: {
  draft: CreationDraft;
  options: ManualOrderFormOptions;
  onChange: (changes: Partial<CreationDraft>) => void;
  disabled: boolean;
}) {
  const t = useTranslations('orders.create');
  const delivery = options.delivery.find((item) => item.id === draft.form.deliveryId);
  const adjustable = options.adjustableFields.filter(
    (field) => !(field === 'shippingCost' && delivery?.kind === 'pickup')
  );
  const payment = (id: string, label: string) =>
    t.has(`payments.${id}` as never) ? t(`payments.${id}` as never) : label;
  return (
    <>
      {options.payments.length ? (
        <ChoiceCards
          label={t('paymentMethod')}
          value={draft.form.paymentMethod ?? ''}
          choices={options.payments.map((item) => ({
            value: item.id,
            label: payment(item.id, item.label),
            description: t(`custodyHint.${item.custody}`),
          }))}
          disabled={disabled}
          onChange={(paymentMethod) =>
            onChange({
              form: { ...draft.form, paymentMethod },
              recordPayment: false,
              paymentReference: '',
            })
          }
        />
      ) : null}
      <Text variant="caption">{t('paymentHint')}</Text>
      {adjustable.length ? (
        <Disclosure
          label={t('adjustments')}
          hint={adjustable.map((field) => t(field)).join(', ')}
          defaultOpen={adjustable.some((field) => draft.form[field] !== undefined)}>
          <Text variant="caption">{t('adjustmentsHint')}</Text>
          {adjustable.map((field) => (
            <CreationNumber
              key={field}
              label={t(field)}
              value={draft.form[field]}
              unit={field === 'taxRate' ? t('percent') : options.currency}
              optional
              disabled={disabled}
              onChange={(value) => onChange({ form: { ...draft.form, [field]: value } })}
            />
          ))}
        </Disclosure>
      ) : null}
      <FormGroup>
        <TextField
          label={t('notes')}
          hint={t('notesHint')}
          value={draft.form.notes ?? ''}
          multiline
          inputClassName="min-h-20"
          maxLength={1000}
          editable={!disabled}
          optional
          onChangeText={(notes) => onChange({ form: { ...draft.form, notes } })}
        />
      </FormGroup>
    </>
  );
}

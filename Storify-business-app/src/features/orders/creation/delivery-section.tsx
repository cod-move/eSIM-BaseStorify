import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { ChoiceCards, FormGroup, ValueChip } from '@/components/ui/form-sections';
import { SelectField } from '@/components/ui/select-field';
import { SwitchSection } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import type { ManualOrderFormOptions } from '@/contracts/mobile/biz/v1';

import { CreationAddress, addressLines } from './controls';
import { savedAddressDraft } from './customer-section';
import type { CreationDraft } from './draft';

/** How the order reaches the customer, and where: delivery or collection, the addresses. */
export function CreationDelivery({
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
  const saved = draft.customerMode === 'existing' ? draft.selectedCustomer : undefined;
  const choices = options.delivery.map((item) => ({
    value: item.id,
    label: item.kind === 'shipping' ? t('shipping') : t('pickupAt', { name: item.label }),
    description: item.kind === 'shipping' ? t('shippingHint') : t('pickupHint'),
  }));
  const choose = (deliveryId: string) => {
    const selected = options.delivery.find((item) => item.id === deliveryId)!;
    onChange({
      form: {
        ...draft.form,
        deliveryId,
        ...(selected.locationId ? { locationId: selected.locationId } : {}),
        ...(selected.kind === 'pickup'
          ? { shippingCost: undefined, shippingAddress: undefined }
          : {}),
      },
    });
  };
  return (
    <>
      {options.delivery.length > 3 ? (
        <SelectField
          label={t('delivery')}
          required
          value={draft.form.deliveryId ?? ''}
          choices={choices}
          disabled={disabled}
          onChange={choose}
        />
      ) : options.delivery.length ? (
        <ChoiceCards
          label={t('delivery')}
          value={draft.form.deliveryId ?? ''}
          choices={choices}
          disabled={disabled}
          onChange={choose}
        />
      ) : null}
      {delivery?.addressRequired ? (
        <FormGroup title={t('shippingAddress')}>
          {saved?.addresses.length ? (
            <View className="gap-2">
              <Text variant="label">{t('savedAddresses')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {saved.addresses.map((address, index) => {
                  const lines = addressLines(
                    savedAddressDraft(address, saved.name, options.countries),
                    options.countries
                  );
                  return (
                    <ValueChip
                      key={index}
                      label={lines[0] ?? lines[1] ?? saved.name}
                      accessibilityLabel={t('useSavedAddress', { address: lines.join(', ') })}
                      icon="check"
                      disabled={disabled}
                      onPress={() =>
                        onChange({
                          form: {
                            ...draft.form,
                            shippingAddress: savedAddressDraft(
                              address,
                              saved.name,
                              options.countries
                            ),
                          },
                        })
                      }
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
          <CreationAddress
            value={draft.form.shippingAddress}
            options={options}
            disabled={disabled}
            onChange={(shippingAddress) => onChange({ form: { ...draft.form, shippingAddress } })}
          />
        </FormGroup>
      ) : null}
      <FormGroup title={t('billingAddress')}>
        <SwitchSection
          title={t('separateBilling')}
          description={t('separateBillingHint')}
          value={draft.billingSeparate}
          disabled={disabled}
          onChange={(billingSeparate) =>
            onChange({
              billingSeparate,
              form: {
                ...draft.form,
                billingAddress: billingSeparate ? (draft.form.billingAddress ?? {}) : undefined,
              },
            })
          }>
          <CreationAddress
            value={draft.form.billingAddress}
            options={options}
            billing
            disabled={disabled}
            onChange={(billingAddress) => onChange({ form: { ...draft.form, billingAddress } })}
          />
        </SwitchSection>
      </FormGroup>
    </>
  );
}

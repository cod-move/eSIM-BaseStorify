import { useState } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChoiceChips } from '@/components/ui/form-sections';
import { ListRow, RowGroup } from '@/components/ui/rows';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import type {
  ManualOrderFormOptions,
  OrderAddress,
  OrderCustomerSelector,
} from '@/contracts/mobile/biz/v1';
import { useCan } from '@/features/workspace/use-workspace';
import { useDebouncedValue } from '@/lib/use-debounced-value';

import { useOrderCreationCustomers } from '../use-order-creation';
import type { CreationDraft } from './draft';

export function savedAddressDraft(
  address: OrderAddress,
  customerName: string,
  countries: ManualOrderFormOptions['countries']
) {
  const countryValue = address.country?.trim().toLowerCase();
  const country = countries.find(
    (item) =>
      item.code.trim().toLowerCase() === countryValue ||
      item.name.trim().toLowerCase() === countryValue
  );
  return {
    name: address.name?.trim() || customerName,
    street: address.street,
    apartment: address.apartment,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: country?.code,
    phone: address.phone,
  };
}

/** Who the order is for: a customer of the store, a guest, or a new guest contact. */
export function CreationCustomer({
  draft,
  options,
  onChange,
  onCreateContact,
  disabled,
  creating,
}: {
  draft: CreationDraft;
  options: ManualOrderFormOptions;
  onChange: (changes: Partial<CreationDraft>) => void;
  onCreateContact: () => void;
  disabled: boolean;
  creating: boolean;
}) {
  const t = useTranslations('orders.create');
  const [search, setSearch] = useState('');
  const [changing, setChanging] = useState(false);
  const term = useDebouncedValue(search.trim().slice(0, 100));
  const canRead = useCan('VIEW_ORDER_CUSTOMERS');
  const canContact = useCan('CREATE_ORDER_CONTACTS');
  const modes = options.customerModes.filter((mode) =>
    mode === 'existing' ? canRead : mode === 'create_contact' ? canContact : true
  );
  const selected = draft.customerMode === 'existing' ? draft.selectedCustomer : undefined;
  const picking = draft.customerMode === 'existing' && canRead && (!selected || changing);
  const customers = useOrderCreationCustomers({ search: term || undefined }, picking);
  const fields =
    draft.customerMode === 'create_contact'
      ? draft.contact
      : draft.form.customer?.kind === 'guest'
        ? draft.form.customer
        : { name: '', email: '', phone: '' };
  const select = (customer: OrderCustomerSelector) => {
    // Their first saved address, only where the delivery chosen asks for one:
    // a collection keeps none (its address fields are not on show to clear).
    const address = options.delivery.find((item) => item.id === draft.form.deliveryId)
      ?.addressRequired
      ? customer.addresses[0]
      : undefined;
    setChanging(false);
    onChange({
      selectedCustomer: customer,
      form: {
        ...draft.form,
        customer: { kind: 'existing', id: customer.id },
        shippingAddress: address
          ? savedAddressDraft(address, customer.name, options.countries)
          : undefined,
        billingAddress: undefined,
      },
    });
  };
  return (
    <>
      {modes.length > 1 ? (
        <ChoiceChips
          label={t('customerMode')}
          value={draft.customerMode}
          choices={modes.map((mode) => ({ value: mode, label: t(`customerModes.${mode}`) }))}
          disabled={disabled}
          onChange={(mode) => {
            setChanging(false);
            onChange({
              customerMode: mode,
              selectedCustomer: undefined,
              form: {
                ...draft.form,
                customer: mode === 'guest' ? { kind: 'guest', name: '', email: '' } : undefined,
                shippingAddress: undefined,
                billingAddress: undefined,
              },
            });
          }}
        />
      ) : null}
      {selected && !changing ? (
        <View className="flex-row items-center gap-3 rounded-lg border-[1.5px] border-accent p-3">
          <Avatar name={selected.name} />
          <View className="flex-1 gap-0.5">
            <Text variant="label" numberOfLines={1}>
              {selected.name}
            </Text>
            {[selected.email, selected.phone].filter(Boolean).map((line) => (
              <Text key={line} variant="meta" numberOfLines={1}>
                {line}
              </Text>
            ))}
          </View>
          <Button
            label={t('changeCustomer')}
            variant="ghost"
            size="sm"
            disabled={disabled}
            onPress={() => setChanging(true)}
          />
        </View>
      ) : null}
      {picking ? (
        <View className="gap-3">
          <SearchField
            label={t('searchCustomers')}
            value={search}
            onChangeText={setSearch}
            maxLength={100}
          />
          {customers.isPending ? (
            <LoadingState shape="rows" />
          ) : customers.isError ? (
            <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
          ) : !customers.data?.items.length ? (
            <EmptyState title={t('noCustomers')} placement="top" />
          ) : (
            <>
              <RowGroup divider="leading" className="rounded-lg border border-border">
                {customers.data.items.map((customer) => (
                  <ListRow
                    key={customer.id}
                    leading={<Avatar name={customer.name} size="sm" />}
                    title={customer.name}
                    meta={[customer.email, customer.phone].filter(Boolean).join(' · ')}
                    accessibilityLabel={customer.name}
                    onPress={() => select(customer)}
                    disabled={disabled}
                  />
                ))}
              </RowGroup>
              {customers.hasNextPage ? (
                <Button
                  label={t('loadMore')}
                  variant="secondary"
                  size="sm"
                  className="self-center"
                  loading={customers.isFetchingNextPage}
                  onPress={() => void customers.fetchNextPage()}
                />
              ) : null}
            </>
          )}
        </View>
      ) : null}
      {draft.customerMode !== 'existing' ? (
        <>
          <Text variant="caption">
            {t(draft.customerMode === 'create_contact' ? 'contactHint' : 'guestHint')}
          </Text>
          {(['name', 'email', 'phone'] as const).map((field) => (
            <TextField
              key={field}
              label={t(`customer.${field}`)}
              value={fields[field] ?? ''}
              maxLength={field === 'email' ? 254 : field === 'phone' ? 50 : 200}
              required={field !== 'phone'}
              optional={field === 'phone'}
              editable={!disabled}
              autoCapitalize={field === 'email' ? 'none' : undefined}
              autoComplete={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'name'}
              keyboardType={
                field === 'email' ? 'email-address' : field === 'phone' ? 'phone-pad' : undefined
              }
              onChangeText={(text) =>
                onChange(
                  draft.customerMode === 'create_contact'
                    ? { contact: { ...draft.contact, [field]: text } }
                    : {
                        form: {
                          ...draft.form,
                          customer: {
                            kind: 'guest',
                            name: fields.name,
                            email: fields.email,
                            phone: fields.phone,
                            [field]: text,
                          },
                        },
                      }
                )
              }
            />
          ))}
          {draft.customerMode === 'create_contact' && canContact ? (
            <Button
              label={t('createContact')}
              icon="plus"
              variant="primary"
              size="sm"
              className="self-start"
              loading={creating}
              disabled={disabled}
              onPress={onCreateContact}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

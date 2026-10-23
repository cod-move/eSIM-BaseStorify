import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getCheckoutQuote } from '@/api/endpoints/checkout';
import { type ApiError, isApiError } from '@/api/errors';
import { STALE } from '@/api/query-client';
import { queryKeys } from '@/api/query-keys';
import {
  type Address,
  type CheckoutPaymentMethod,
  type CheckoutQuote,
  type CheckoutQuoteRequest,
  type PlaceOrderRequest,
  PricesChangedDetails,
} from '@/contracts/mobile/shop/v1';
import type { AddressForm } from '@/features/addresses/use-addresses';
import { useLocale } from '@/i18n/locale-store';

/** Typing settles for this long before the store is asked again (quotes allow 100 per 15 minutes). */
const QUOTE_DEBOUNCE_MS = 400;

/** A saved address as checkout sends it: its fields, and a name when it has none of its own. */
type QuoteAddress = Omit<Address, 'id' | 'label' | 'isDefault'> & { fullName?: string };
/** A delivery address the store can place an order to: street, city and country filled in. */
type PlaceAddress = NonNullable<PlaceOrderRequest['shippingAddress']>;
export type PaymentMethodId = CheckoutPaymentMethod['id'];

/** The address a guest types in place of the address book; the phone is the contact's. */
export type GuestAddress = Omit<AddressForm, 'label' | 'phone'>;

/**
 * The payment flows this version of the app takes; the others come in a later
 * update. A card is paid in Stripe's payment sheet, which only a phone has: the
 * web build takes cash on delivery alone.
 */
const PAYABLE_FLOWS: readonly CheckoutPaymentMethod['flow'][] =
  Platform.OS === 'web' ? ['cod'] : ['cod', 'card'];

/**
 * The quote of the form as it stands, asked again (debounced) on every change.
 * While a newer quote is on its way, the last one stays on screen and
 * `repricing` holds the pay button. Nothing is asked while `enabled` is false.
 *
 * Where the store refuses the form as it stands (400 VALIDATION_ERROR: a
 * country it does not deliver to, half typed or not), the last quote it gave
 * also stays, and `refusal` holds the store's errors by field. A refusal is
 * the form's to fix, not the screen's to replace.
 */
export function useCheckoutQuote(request: CheckoutQuoteRequest, enabled = true) {
  const locale = useLocale();
  const wanted = JSON.stringify(request);
  const [settled, setSettled] = useState(request);
  const settledKey = JSON.stringify(settled);

  useEffect(() => {
    const timer = setTimeout(
      () => setSettled(JSON.parse(wanted) as CheckoutQuoteRequest),
      QUOTE_DEBOUNCE_MS
    );
    return () => clearTimeout(timer);
  }, [wanted]);

  const query = useQuery({
    queryKey: queryKeys.checkoutQuote(locale, settled),
    queryFn: ({ signal }) => getCheckoutQuote(locale, settled, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE.private,
    enabled,
  });

  // The last quote the store gave, kept through a refusal (set while rendering, as React allows).
  const [lastQuote, setLastQuote] = useState(query.data);
  if (query.data !== undefined && query.data !== lastQuote) setLastQuote(query.data);
  const refusal = refusalOf(query.error);

  return {
    query,
    quote: query.data ?? (refusal ? lastQuote : undefined),
    refusal,
    repricing: query.isFetching || wanted !== settledKey,
  };
}

/** The store's errors by field, when it refused the form as it stands. */
function refusalOf(error: unknown): Record<string, string[]> | undefined {
  if (!isApiError(error) || error.code !== 'VALIDATION_ERROR') return undefined;
  return error.errors ?? {};
}

/**
 * After PRICES_CHANGED, the quote the store sent with the refusal replaces the
 * one on screen, and the form is priced again.
 */
export function useNewQuoteOn(error: unknown) {
  const locale = useLocale();
  const client = useQueryClient();

  useEffect(() => {
    if (!isPricesChanged(error)) return;
    const quotes = ['private', locale, 'checkout-quote'];
    const details = PricesChangedDetails.safeParse(error.details);
    if (details.success) client.setQueriesData({ queryKey: quotes }, details.data.quote);
    void client.invalidateQueries({ queryKey: quotes });
  }, [client, error, locale]);
}

/** The quote's methods this version of the app can pay with: cash on delivery and card. */
export function payableMethods(methods: CheckoutPaymentMethod[]): CheckoutPaymentMethod[] {
  return methods.filter((method) => PAYABLE_FLOWS.includes(method.flow));
}

/**
 * Whether "Place order" may be tapped: the quote is final (`quoteHash`),
 * nothing is missing, delivery is priced or not needed, the chosen method can
 * take the order, payments are not paused, and the human check is passed when
 * the store asks for one.
 */
export function canPlace(
  quote: CheckoutQuote,
  method: PaymentMethodId | undefined,
  captchaToken?: string
): boolean {
  const chosen = quote.paymentMethods.find((candidate) => candidate.id === method);
  return (
    Boolean(quote.quoteHash) &&
    Object.keys(quote.fieldErrors).length === 0 &&
    (quote.shipping.status === 'READY' || quote.shipping.status === 'NOT_REQUIRED') &&
    chosen?.available === true &&
    !quote.paymentsPaused &&
    (!quote.captcha.required || Boolean(captchaToken))
  );
}

/** The parts of the screen a field error can land on. */
export type CheckoutField =
  'name' | 'address' | 'contact' | 'delivery' | 'note' | 'account' | 'form';

/** Where a `fieldErrors` key is shown ("shippingAddress.fullName" on the name, "account" asks to sign in). */
export function fieldOf(key: string): CheckoutField {
  if (key === 'account') return 'account';
  if (/^(shipping|billing)Address\.(fullName|firstName|lastName)$/.test(key)) return 'name';
  if (/^(shipping|billing)Address\./.test(key) || key === 'address.country') return 'address';
  if (key === 'email' || key === 'phone') return 'contact';
  if (key === 'selectedShippingOptionId' || key.startsWith('vendorShippingSelections')) {
    return 'delivery';
  }
  if (key === 'customerNote') return 'note';
  return 'form';
}

/**
 * The parts of the screen that carry an error. A custom field shows its own
 * error under itself, so it puts none on the form.
 */
export function fieldsWithErrors(fieldErrors: CheckoutQuote['fieldErrors']): Set<CheckoutField> {
  return new Set(
    Object.keys(fieldErrors)
      .filter((key) => !key.startsWith('customFields.'))
      .map(fieldOf)
  );
}

/**
 * A saved address as the quote takes it. The book allows a nameless address
 * and checkout does not: the profile's name stands in when it has none.
 */
export function toQuoteAddress(address: Address, profileName?: string): QuoteAddress {
  const { id: _id, label: _label, isDefault: _isDefault, ...fields } = address;
  if (fields.firstName || fields.lastName || !profileName) return fields;
  return { ...fields, fullName: profileName };
}

/**
 * What a guest typed, as the quote takes it: trimmed, the empty fields left
 * out. Nothing until street, city and country are filled in, as delivery cannot
 * be priced without them.
 */
export function guestQuoteAddress(form: GuestAddress, phone?: string): PlaceAddress | undefined {
  const optional = (value: string) => value.trim() || undefined;
  const street = form.street.trim();
  const city = form.city.trim();
  const country = form.country.trim();
  if (!street || !city || !country) return undefined;
  return {
    firstName: optional(form.firstName),
    lastName: optional(form.lastName),
    street,
    apartment: optional(form.apartment),
    city,
    state: optional(form.state),
    postalCode: optional(form.postalCode),
    country,
    phone,
  };
}

export function isPricesChanged(error: unknown): error is ApiError {
  return isApiError(error) && error.reason === 'PRICES_CHANGED';
}

/** The store sells to signed-in shoppers only: the guest is sent to sign in. */
export function isSignInRequired(error: unknown): boolean {
  return isApiError(error) && error.reason === 'SIGN_IN_REQUIRED';
}

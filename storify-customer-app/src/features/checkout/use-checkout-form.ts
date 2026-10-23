import { couponCodeToPlace } from '@/features/coupons/coupon-code';
import { useState } from 'react';

import type {
  Address,
  CheckoutPaymentMethod,
  CheckoutQuoteRequest,
} from '@/contracts/mobile/shop/v1';
import { useMe } from '@/features/account/use-me';
import { useAddresses } from '@/features/addresses/use-addresses';
import { useSession } from '@/features/auth/use-session';
import { useConfig } from '@/features/config/use-config';
import { usePlaceOrder } from '@/features/payments/use-place-order';

import {
  canPlace,
  type GuestAddress,
  guestQuoteAddress,
  isSignInRequired,
  type PaymentMethodId,
  payableMethods,
  toQuoteAddress,
  useCheckoutQuote,
  useNewQuoteOn,
} from './use-checkout';

/** A custom field's answer, under its `CheckoutCustomField.id`. */
export type CustomAnswers = Record<string, string | boolean>;

const NO_GUEST_ADDRESS: GuestAddress = {
  firstName: '',
  lastName: '',
  street: '',
  apartment: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
};

/**
 * The checkout form as the shopper fills it in, and the quote of it. Every
 * change asks the store again; the screen draws only what the quote says.
 * The payment method starts as the store's website starts it: cash on delivery
 * when the store takes it for this order, otherwise the first method it takes.
 * The shopper's own choice replaces it.
 *
 * A guest checks out the cart of their token, typing a contact and an address
 * in place of the account's, where the store sells to guests
 * (`features.guestCheckout`). Where it does not, or the store answers
 * SIGN_IN_REQUIRED, `signInNeeded` sends them to sign in.
 */
export function useCheckoutForm() {
  const session = useSession();
  const config = useConfig();
  const guest = !session.isSignedIn;
  const book = useAddresses();
  const me = useMe(session.isSignedIn);
  const [chosen, setAddress] = useState<Address>();
  const [note, setNote] = useState('');
  const [optionId, setOptionId] = useState<string>();
  const [sellerOptions, setSellerOptions] = useState<Record<string, string>>({});
  const [picked, setMethod] = useState<PaymentMethodId>();
  // Filled by the human check when the quote asks for one.
  const [captchaToken, setCaptchaToken] = useState<string>();
  // The code the shopper chose; the quote says whether the store takes it.
  const [couponCode, setCouponCode] = useState<string>();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [guestAddress, setGuestAddress] = useState(NO_GUEST_ADDRESS);
  const [customFields, setCustomFields] = useState<CustomAnswers>({});

  const known = !session.isPending && config.data !== undefined;
  const guestsWelcome = config.data?.features.guestCheckout === true;
  const contactPhone = phone.trim() || undefined;

  const address = guest ? undefined : (chosen ?? book.data?.[0]);
  const shippingAddress = guest
    ? guestQuoteAddress(guestAddress, contactPhone)
    : address
      ? toQuoteAddress(address, me.data?.name)
      : undefined;
  const request: CheckoutQuoteRequest = {
    shippingAddress,
    email: guest ? email.trim() || undefined : undefined,
    phone: guest ? contactPhone : undefined,
    selectedShippingOptionId: optionId,
    vendorShippingSelections: Object.keys(sellerOptions).length > 0 ? sellerOptions : undefined,
    customerNote: note.trim() || undefined,
    customFields: answered(customFields),
    paymentMethod: picked,
    couponCode,
  };
  const { query, quote, refusal, repricing } = useCheckoutQuote(
    request,
    known && (!guest || guestsWelcome)
  );
  // The one place the quote's methods are narrowed to those this version can take.
  const methods = quote ? payableMethods(quote.paymentMethods) : [];
  const method = picked ?? startingMethod(methods);
  const placing = usePlaceOrder();
  useNewQuoteOn(placing.error);
  // A quote kept through a refusal is for another form: it places nothing.
  const ready =
    quote !== undefined && !refusal && !repricing && canPlace(quote, method, captchaToken);

  const signInNeeded =
    guest &&
    ((known && !guestsWelcome) ||
      quote?.form.guestCheckout === false ||
      isSignInRequired(query.error) ||
      isSignInRequired(placing.error));

  /** Places the order, or pays for it by card; the payments step opens the outcome. */
  function place() {
    if (!quote?.quoteHash || !ready || !method) return;
    void placing.place(
      {
        shippingAddress,
        email: request.email,
        phone: request.phone,
        selectedShippingOptionId: request.selectedShippingOptionId,
        vendorShippingSelections: request.vendorShippingSelections,
        customerNote: request.customerNote,
        customFields: request.customFields,
        couponCode: couponCodeToPlace(couponCode, quote.coupon),
        quoteHash: quote.quoteHash,
        turnstileToken: captchaToken,
      },
      method
    );
  }

  return {
    query,
    quote,
    refusal,
    repricing,
    guest,
    signInNeeded,
    address,
    setAddress,
    email,
    setEmail,
    phone,
    setPhone,
    guestAddress,
    setGuestField: (field: keyof GuestAddress, value: string) =>
      setGuestAddress((typed) => ({ ...typed, [field]: value })),
    customFields,
    setCustomField: (id: string, value: string | boolean) =>
      setCustomFields((all) => ({ ...all, [id]: value })),
    note,
    setNote,
    chooseOption: (id: string, vendorId?: string) =>
      vendorId ? setSellerOptions((all) => ({ ...all, [vendorId]: id })) : setOptionId(id),
    methods,
    method,
    setMethod,
    captchaToken,
    setCaptchaToken,
    setCouponCode,
    ready,
    place,
    placing,
  };
}

export type CheckoutFormState = ReturnType<typeof useCheckoutForm>;

/** Cash on delivery when the store takes it for this order, otherwise the first method it takes. */
function startingMethod(methods: CheckoutPaymentMethod[]): PaymentMethodId | undefined {
  const usable = methods.filter((method) => method.available);
  return (usable.find((method) => method.id === 'cod') ?? usable[0])?.id;
}

/** The answers given, the blank ones left out; nothing when there are none. */
function answered(answers: CustomAnswers): CustomAnswers | undefined {
  const given = Object.entries(answers)
    .map(([id, value]) => [id, typeof value === 'string' ? value.trim() : value] as const)
    .filter(([, value]) => value !== '');
  return given.length > 0 ? Object.fromEntries(given) : undefined;
}

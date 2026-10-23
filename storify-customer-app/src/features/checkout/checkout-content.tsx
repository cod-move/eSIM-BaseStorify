import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslations } from 'use-intl';

import { isApiError } from '@/api/errors';
import { TextLink } from '@/components/ui/button';
import type { CheckoutCustomField, CheckoutQuote } from '@/contracts/mobile/shop/v1';
import { AddressSheet } from '@/features/addresses/address-sheet';
import { CouponSection } from '@/features/coupons/coupon-section';
import { PaymentSection } from '@/features/payments/payment-section';
import { useErrorMessage } from '@/i18n/use-error-message';

import { CaptchaGate } from './captcha-bridge';
import {
  AddressSection,
  DeliverySection,
  FieldError,
  ItemsSection,
  SectionTitle,
} from './checkout-sections';
import { CheckoutBreakdown, CheckoutSummary } from './checkout-summary';
import { CustomFields } from './custom-fields';
import { ContactCard, GuestAddressForm } from './guest-sections';
import { fieldsWithErrors, isPricesChanged } from './use-checkout';
import type { CheckoutFormState } from './use-checkout-form';

const NEW_ADDRESS = '/account/addresses/new';
/** How far above the keyboard the field being typed in is kept. */
const KEYBOARD_GAP = 24;

/**
 * Checkout, drawn from the quote: the contact (guests only), delivery location,
 * delivery method, the items, the payment method, the store's own fields and
 * the totals' rows, then the total and "Place order" pinned under them.
 */
export function CheckoutContent({
  form,
  quote,
}: {
  form: CheckoutFormState;
  quote: CheckoutQuote;
}) {
  const t = useTranslations('checkout');
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const [sheet, setSheet] = useState(false);
  const [noteShown, setNoteShown] = useState(false);
  // The fields the shopper has left: their errors show from then on.
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  // What the quote says is missing, and what the store refused in the form as it stands.
  const fieldErrors = { ...quote.fieldErrors, ...form.refusal };
  const errors = fieldsWithErrors(fieldErrors);
  const failure = form.placing.error;
  const refused = isApiError(failure) ? (failure.errors ?? {}) : {};

  const errorOf = (key: string) =>
    refused[key]?.[0] ?? (failure || left.has(key) ? fieldErrors[key]?.[0] : undefined);
  const leave = (key: string) => setLeft((keys) => new Set(keys).add(key));
  const placed = (placement: string) =>
    quote.form.customFields.filter((field) => placementOf(field) === placement);
  const customFields = (placement: string) => (
    <CustomFields
      fields={placed(placement)}
      values={form.customFields}
      onChange={form.setCustomField}
      errorOf={errorOf}
      onLeave={leave}
    />
  );

  function noticeOf(error: unknown) {
    if (!error) return undefined;
    if (isPricesChanged(error)) return t('pricesChanged');
    if (!isApiError(error)) return t('placeFailed');
    if (error.reason === 'PAYMENTS_PAUSED') return t('paymentsPaused');
    // The stock sentences say what to do; the shopper stays signed in.
    if (error.code === 'EMAIL_NOT_VERIFIED' || error.code === 'VALIDATION_ERROR') {
      return errorMessage(error);
    }
    return t('placeFailed');
  }

  return (
    <View className="flex-1 bg-background">
      {/* The page ends where the pinned summary starts, so its last row is never under the
          summary or the tab bar; the keyboard floats over both, and a field it covers scrolls up. */}
      <KeyboardAwareScrollView
        bottomOffset={KEYBOARD_GAP}
        className="flex-1"
        contentContainerClassName="gap-3 px-3 pb-8 pt-4"
        keyboardShouldPersistTaps="handled">
        {form.guest ? (
          <>
            <SectionTitle
              end={
                // As the website offers it: a shopper with an account fills nothing in, and the cart merges.
                <TextLink
                  label={t('signIn')}
                  accessibilityLabel={t('signInFaster')}
                  onPress={() => router.push('/login')}
                />
              }>
              {t('contact')}
            </SectionTitle>
            <ContactCard
              contactMode={quote.form.contactMode}
              email={form.email}
              phone={form.phone}
              onEmail={form.setEmail}
              onPhone={form.setPhone}
              errorOf={errorOf}
              onLeave={leave}
            />
          </>
        ) : (
          <>
            <FieldError field="account" errors={errors} />
            <FieldError field="contact" errors={errors} />
          </>
        )}
        {customFields('contact')}
        <SectionTitle>{t('deliveryLocation')}</SectionTitle>
        {form.guest ? (
          <GuestAddressForm
            fields={quote.form.addressFields}
            address={form.guestAddress}
            onChange={form.setGuestField}
            errorOf={errorOf}
            onLeave={leave}
          />
        ) : (
          <AddressSection
            address={form.address}
            errors={errors}
            note={form.note}
            noteShown={noteShown}
            noteVisible={quote.form.orderNote.visibility !== 'hidden'}
            onChange={() => setSheet(true)}
            onNotes={() => setNoteShown((shown) => !shown)}
            onNote={form.setNote}
          />
        )}
        {customFields('delivery')}
        <SectionTitle>{t('deliveryMethod')}</SectionTitle>
        <DeliverySection shipping={quote.shipping} errors={errors} onChoose={form.chooseOption} />
        <SectionTitle>{t('items')}</SectionTitle>
        <ItemsSection lines={quote.lines} />
        <SectionTitle>{t('paymentMethod')}</SectionTitle>
        {/* The method starts as the website starts it (cash on delivery when the store takes it). */}
        <PaymentSection
          methods={form.methods}
          value={form.method}
          onChange={form.setMethod}
          busy={form.placing.busy}
        />
        <CouponSection
          coupon={quote.coupon}
          pending={form.repricing}
          onApply={form.setCouponCode}
          onRemove={() => form.setCouponCode(undefined)}
        />
        {placed('additional').some((field) => field.visibility !== 'hidden') ? (
          <SectionTitle>{t('additional')}</SectionTitle>
        ) : null}
        {customFields('additional')}
        <CaptchaGate
          captcha={quote.captcha}
          token={form.captchaToken}
          onToken={form.setCaptchaToken}
        />
        <FieldError field="form" errors={errors} />
        <CheckoutBreakdown totals={quote.totals} />
      </KeyboardAwareScrollView>
      <CheckoutSummary
        totals={quote.totals}
        ready={form.ready && !form.placing.busy}
        placing={form.placing.busy}
        notice={noticeOf(failure)}
        onPlace={form.place}
      />
      {form.guest ? null : (
        <AddressSheet
          visible={sheet}
          selectedId={form.address?.id}
          onApply={(address) => {
            form.setAddress(address);
            setSheet(false);
          }}
          onAddNew={() => {
            setSheet(false);
            router.push(NEW_ADDRESS);
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </View>
  );
}

/** Where a custom field goes: contact, delivery, or with the additional details (any other). */
function placementOf(field: CheckoutCustomField) {
  return field.placement === 'contact' || field.placement === 'delivery'
    ? field.placement
    : 'additional';
}

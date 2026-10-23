export const paymentsKeys = {
  /** How a card payment ended, asked of the store until the answer is final. */
  paymentOutcome: (locale: string, paymentIntentId: string) =>
    ['private', locale, 'payments', 'outcome', paymentIntentId] as const,
};

import { Redirect, useLocalSearchParams } from 'expo-router';

import { OutcomeScreen } from '@/features/payments/outcome-screen';
import { readResult } from '@/features/payments/success-params';

/**
 * `/checkout/success`: how the payment ended. The address can be written by
 * anybody, so it is read as untrusted input; one this screen does not know goes Home.
 */
export default function CheckoutSuccessScreen() {
  const result = readResult(useLocalSearchParams());
  return result ? <OutcomeScreen result={result} /> : <Redirect href="/" />;
}

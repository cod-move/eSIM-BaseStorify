import { useLocalSearchParams } from 'expo-router';

import { ForgotPasswordScreen } from '@/features/auth/forgot-password-screen';

/** Forgot password: the reset link in the email is followed on the store's website. */
export default function ForgotPassword() {
  const { email } = useLocalSearchParams<{ email?: string }>();
  return <ForgotPasswordScreen initialEmail={email} />;
}

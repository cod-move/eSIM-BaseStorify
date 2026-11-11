import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { KycView } from '@/features/esim/kyc-view';
import { useEsimKyc } from '@/features/esim/use-account';

/** Identity verification (the eSIM module, APP-07): the website's /account/esims/verification. */
export default function EsimVerificationScreen() {
  const t = useTranslations('esim');
  const kyc = useEsimKyc();

  const body = () => {
    if (kyc.isPending) return <LoadingState />;
    if (kyc.isError) return <ErrorState error={kyc.error} onRetry={() => void kyc.refetch()} />;
    return <KycView kyc={kyc.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('kycTitle') }} />
      {body()}
    </>
  );
}

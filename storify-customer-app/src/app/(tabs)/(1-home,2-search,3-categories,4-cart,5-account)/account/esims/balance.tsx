import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { ErrorState, LoadingState } from '@/components/ui/state-view';
import { useEsimWallet } from '@/features/esim/use-account';
import { WalletView } from '@/features/esim/wallet-view';

/** The balance (the eSIM module, APP-07): the website's /account/esims/balance. */
export default function EsimBalanceScreen() {
  const t = useTranslations('esim');
  const wallet = useEsimWallet();

  const body = () => {
    if (wallet.isPending) return <LoadingState />;
    if (wallet.isError)
      return <ErrorState error={wallet.error} onRetry={() => void wallet.refetch()} />;
    return <WalletView wallet={wallet.data} />;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('balance') }} />
      {body()}
    </>
  );
}

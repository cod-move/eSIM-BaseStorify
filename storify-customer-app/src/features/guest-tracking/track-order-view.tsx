import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useTranslations } from 'use-intl';

import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';

import { LookupForm } from './lookup-form';
import { refusalOf, waitMinutes, type LookupValues } from './lookup';
import { TrackedOrder } from './tracked-order';
import { useTrackOrder } from './use-track-order';

const EMPTY: LookupValues = { orderNumber: '', contact: '' };

/**
 * Tracking an order without an account. The form, then one of: the lookup under
 * way, the order, the store's "no such order", the wait it asks for, or an error.
 * What the shopper typed is kept, so a typo is corrected, not retyped.
 */
export function TrackOrderView() {
  const t = useTranslations('trackOrder');
  const track = useTrackOrder();
  const [values, setValues] = useState<LookupValues>(EMPTY);

  const again = <Button label={t('tryAgain')} onPress={() => track.reset()} />;

  const body = () => {
    if (track.isPending) return <LoadingState />;
    if (track.isSuccess) {
      return (
        <TrackedOrder
          order={track.data}
          onTrackAnother={() => {
            setValues(EMPTY);
            track.reset();
          }}
        />
      );
    }
    if (track.isError) {
      const refusal = refusalOf(track.error);
      if (refusal.kind === 'not-found') {
        return (
          <EmptyState
            icon="search"
            title={t('notFoundTitle')}
            body={t('notFoundBody')}
            action={again}
          />
        );
      }
      if (refusal.kind === 'rate-limited') {
        return (
          <EmptyState
            icon="warning"
            title={t('rateLimitedTitle')}
            body={
              refusal.seconds === undefined
                ? t('rateLimitedBodyUnknown')
                : t('rateLimitedBody', { minutes: waitMinutes(refusal.seconds) })
            }
            action={again}
          />
        );
      }
      return <ErrorState error={refusal.error} onRetry={() => track.reset()} />;
    }
    return (
      <LookupForm
        values={values}
        onChange={setValues}
        onSubmit={(request) => track.mutate(request)}
      />
    );
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="grow p-4"
      keyboardShouldPersistTaps="handled">
      {body()}
    </ScrollView>
  );
}

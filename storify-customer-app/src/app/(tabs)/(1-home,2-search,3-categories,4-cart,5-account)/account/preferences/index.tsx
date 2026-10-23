import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { useTranslations } from 'use-intl';

import { HeaderTitle } from '@/components/shell/app-header';
import { useBottomSpace } from '@/components/shell/tab-bar';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/state-view';
import { PreferenceGroups } from '@/features/preferences/preference-groups';
import { usePreferences } from '@/features/preferences/use-preferences';

/** What the shopper hears from the store: one switch per subject, as the store lists them. */
export default function PreferencesScreen() {
  const t = useTranslations('preferences');
  const preferences = usePreferences();
  const bottom = useBottomSpace();

  const header = (
    <Stack.Screen
      options={{ headerTitle: () => <HeaderTitle icon="filter" title={t('title')} /> }}
    />
  );

  if (preferences.isPending) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  if (preferences.isError) {
    return (
      <>
        {header}
        <ErrorState error={preferences.error} onRetry={() => void preferences.refetch()} />
      </>
    );
  }
  if (preferences.data.groups.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon="filter" title={t('emptyTitle')} body={t('emptyBody')} />
      </>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      {header}
      <PreferenceGroups groups={preferences.data.groups} />
    </ScrollView>
  );
}

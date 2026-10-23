import { ScrollView } from 'react-native';

import { useBottomSpace } from '@/components/shell/tab-bar';
import { LanguageRow, ThemePicker } from '@/features/account/settings';

/** The app's own settings, for a guest as for a shopper: the language and the appearance. */
export default function SettingsScreen() {
  const bottom = useBottomSpace();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-6 px-4 pt-4"
      contentContainerStyle={{ paddingBottom: bottom + 24 }}>
      <LanguageRow />
      <ThemePicker />
    </ScrollView>
  );
}

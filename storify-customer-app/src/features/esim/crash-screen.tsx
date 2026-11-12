import type { ErrorBoundaryProps } from 'expo-router';
// eslint-disable-next-line no-restricted-imports -- drawn outside the app's providers and theme, which may be what failed
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { useLocaleStore } from '@/i18n/locale-store';

/**
 * What the app shows when a screen fails to draw (patch P58): a sentence and
 * a way to try again, in place of a white page. It draws outside the app's
 * providers (they may be what failed), so it uses no theme and no messages:
 * its words are here, and the error's own message is shown small, so a
 * screenshot says what broke.
 */
const WORDS = {
  en: { title: 'Something went wrong', body: 'This screen could not be shown.', retry: 'Try again' },
  zh: { title: '出了点问题', body: '这个页面没能显示出来。', retry: '重试' },
  'zh-hant': { title: '出了點問題', body: '這個頁面沒能顯示出來。', retry: '重試' },
} as const;

export function CrashScreen({ error, retry }: ErrorBoundaryProps) {
  const locale = useLocaleStore((state) => state.locale);
  const words = WORDS[locale as keyof typeof WORDS] ?? WORDS.en;
  const dark = useColorScheme() === 'dark';
  const ink = dark ? '#f5f5f5' : '#111111';
  const muted = dark ? '#a3a3a3' : '#6b6b6b';

  return (
    <View style={[styles.page, { backgroundColor: dark ? '#0a0a0a' : '#ffffff' }]}>
      <Text style={[styles.title, { color: ink }]}>{words.title}</Text>
      <Text style={[styles.body, { color: muted }]}>{words.body}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={[styles.button, { backgroundColor: ink }]}>
        <Text style={[styles.label, { color: dark ? '#0a0a0a' : '#ffffff' }]}>{words.retry}</Text>
      </Pressable>
      <Text selectable style={[styles.detail, { color: muted }]}>
        {error.message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center' },
  button: { marginTop: 8, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 12 },
  label: { fontSize: 15, fontWeight: '600' },
  detail: { marginTop: 16, fontSize: 12, textAlign: 'center' },
});

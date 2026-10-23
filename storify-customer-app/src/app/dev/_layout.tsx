import { Stack } from 'expo-router';

/** The titles of the gallery's pages. They are for developers and stay in English. */
const TITLES: Record<string, string> = {
  index: 'Kit gallery',
  controls: 'Controls',
  cards: 'Cards',
  forms: 'Forms',
  overlays: 'Overlays',
  states: 'States',
  'rich-text': 'Rich text',
  shell: 'Shell',
};

/** Development only: the kit gallery, one page per family of components. */
export default function DevLayout() {
  return (
    <>
      {/* The gallery has its own header; the app's would stack a second one above it. */}
      <Stack.Screen options={{ headerShown: false }} />
      <Stack
        screenOptions={({ route }) => ({
          title: TITLES[route.name] ?? route.name,
          headerBackButtonDisplayMode: 'minimal',
        })}
      />
    </>
  );
}

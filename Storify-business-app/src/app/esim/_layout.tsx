import { Stack } from 'expo-router';

/** The eSIM area's screens (patch P77 lists the area in the root stack). */
export default function EsimLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

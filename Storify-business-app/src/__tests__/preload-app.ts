import { getMockContext } from 'expo-router/testing-library';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

// Babel leaves React Native's lazy exports untouched until a screen renders.
// Resolve the primitives these screens use before a timed async render starts.
void [
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
];

// Compile the real routes during suite collection, as static imports would.
// Cold Babel transforms must finish before the timed async render starts;
// timing out that render leaves act() open when Jest begins cleanup.
const appRoutes = getMockContext('./src/app');
for (const route of appRoutes.keys()) appRoutes(route);

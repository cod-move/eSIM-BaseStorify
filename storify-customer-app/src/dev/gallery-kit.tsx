import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';

/**
 * The frame of the kit gallery: the development-only pages under `/dev` that
 * show every component of `src/components` in each of its states, in light,
 * dark and right to left.
 *
 * Each family of components has its own page, `src/app/dev/<page>.tsx`, built from
 * these three pieces so that every page reads alike. A page holds sections, a
 * section holds items, an item names the state it shows. The names are for
 * developers and stay in English; what the components themselves say comes
 * from the messages, as everywhere else.
 */
export function GalleryPage({ children }: PropsWithChildren) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-8 p-4 pb-16">
      {children}
    </ScrollView>
  );
}

export function GallerySection({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View className="gap-3">
      <Text variant="heading">{title}</Text>
      {children}
    </View>
  );
}

/** One component in one state, with its name above it: "Primary · disabled". */
export function GalleryItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text variant="caption">{label}</Text>
      {children}
    </View>
  );
}

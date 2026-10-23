import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { SheetPanel, SheetStage } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';

type AuthSheetProps = {
  title: string;
  /** A back button at the start: the step before, as from the code back to the password. */
  onBack?: () => void;
  children: ReactNode;
};

/**
 * The sign-in sheet. Its route opens over the screen the
 * shopper was on, which shows dimmed behind it; closing the sheet, or signing
 * in, leaves the shopper there.
 */
export function AuthSheet({ title, onBack, children }: AuthSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  // The sheet slides out first, then the route closes under it.
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const close = () => setOpen(false);

  return (
    <SheetStage open={open} onDismiss={close} onClosed={leave}>
      <SheetPanel title={title} onClose={close} onBack={onBack} size="tall">
        {children}
      </SheetPanel>
    </SheetStage>
  );
}

/** A sentence the store refused the form with, for no field in particular. */
export function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <Text variant="caption" className="text-danger" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

/** "Haven't signed up yet? Create an account": the way to the other form. */
export function SwitchLine({
  question,
  action,
  onPress,
}: {
  question: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View className="items-center gap-1 pt-2">
      <Text variant="subheading">{question}</Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={action}
        onPress={onPress}
        hitSlop={12}
        className="min-h-11 justify-center active:opacity-70">
        <Text variant="subheading" className="text-link underline">
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

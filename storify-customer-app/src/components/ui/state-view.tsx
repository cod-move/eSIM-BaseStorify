import type { PropsWithChildren, ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslations } from 'use-intl';

import type { ImageSet } from '@/contracts/mobile/shop/v1';
import { useErrorMessage } from '@/i18n/use-error-message';

import { AppImage } from './app-image';
import { Button } from './button';
import { Icon, type IconName } from './icon';
import { Skeleton } from './skeleton';
import { Text } from './text';

/**
 * What a screen shows when it has no content to show:
 * it is loading, it failed, there is nothing, it worked, or it is
 * handing the shopper over to the next screen. Every screen uses these, so they
 * look and read the same everywhere.
 */

function Centered({ children }: PropsWithChildren) {
  return <View className="flex-1 items-center justify-center bg-background p-6">{children}</View>;
}

/**
 * Loading: the shapes of a page that is on its way (a wide picture, a heading, two rows of
 * cards), shimmering, so a screen never opens on a lone spinner.
 */
export function LoadingState() {
  const t = useTranslations('common');

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading')}
      className="flex-1 gap-5 bg-background p-4">
      <Skeleton className="h-44 w-full rounded-2xl" />
      <Skeleton className="h-5 w-2/5" />
      {[0, 1].map((row) => (
        <View key={row} className="flex-row gap-3">
          {[0, 1].map((column) => (
            <View key={column} className="flex-1 gap-2">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-4 w-1/2" />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

type MessageProps = {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
};

/** The shape Empty and Error share: an icon, a line, a quieter line, and a way out. */
function Message({ icon, title, body, action }: MessageProps) {
  return (
    <Centered>
      <View className="max-w-[320px] items-center gap-2">
        <Icon name={icon} size={48} colorClassName="accent-muted" />
        <Text variant="subheading" className="text-center">
          {title}
        </Text>
        {body ? <Text className="text-center text-muted">{body}</Text> : null}
        {action ? <View className="mt-4 self-stretch">{action}</View> : null}
      </View>
    </Centered>
  );
}

type ErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
};

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const t = useTranslations('common');
  const describe = useErrorMessage();

  return (
    <Message
      icon="warning"
      title={t('errorTitle')}
      body={describe(error)}
      action={onRetry ? <Button label={t('retry')} onPress={onRetry} /> : undefined}
    />
  );
}

type EmptyStateProps = {
  title: string;
  body?: string;
  /** The icon of the thing that is missing: the cart's, the orders'. */
  icon?: IconName;
  /** Usually a button that leads somewhere useful. */
  action?: ReactNode;
};

export function EmptyState({ title, body, icon = 'bag', action }: EmptyStateProps) {
  return <Message icon={icon} title={title} body={body} action={action} />;
}

type SuccessStateProps = {
  title: string;
  body?: string;
  /** What the shopper does next: a column of buttons. */
  actions?: ReactNode;
};

/** "Payment Successful!": a check in a `surface` disc, the title, a line, the way on. */
export function SuccessState({ title, body, actions }: SuccessStateProps) {
  return (
    <Centered>
      <View className="max-w-[320px] items-center gap-3">
        <View className="mb-3 size-[114px] items-center justify-center rounded-full bg-surface">
          <Icon name="check" size={56} colorClassName="accent-success" strokeWidth={2.5} />
        </View>
        <Text variant="display" className="text-center">
          {title}
        </Text>
        {body ? <Text className="text-center text-muted">{body}</Text> : null}
        {actions ? <View className="mt-5 gap-3 self-stretch">{actions}</View> : null}
      </View>
    </Centered>
  );
}

type HandoffStateProps = {
  /** The shopper's picture. Without one, a person's outline stands in. */
  picture?: ImageSet;
  /** "Signing you in…" */
  title: string;
  /** The email the shopper is signing in with. */
  body?: string;
};

/** The wait between a step done and the next screen: a picture, a line, no buttons. */
export function HandoffState({ picture, title, body }: HandoffStateProps) {
  return (
    <Centered>
      <View className="max-w-[320px] items-center gap-3">
        <View className="mb-3 size-24 items-center justify-center overflow-hidden rounded-full bg-surface">
          {picture ? (
            <AppImage image={picture} size="card" className="size-24" decorative />
          ) : (
            <Icon name="user" size={40} colorClassName="accent-muted" />
          )}
        </View>
        <Text variant="display" className="text-center">
          {title}
        </Text>
        {body ? <Text className="text-center text-muted">{body}</Text> : null}
      </View>
    </Centered>
  );
}

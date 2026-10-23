import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useTranslations } from 'use-intl';

import { useErrorMessage } from '@/i18n/use-error-message';
import { cn } from '@/lib/cn';

import { Button, TextLink } from './button';
import { Icon, type IconName } from './icon';
import { IconCircle } from './icon-circle';
import { SkeletonRows } from './skeleton';
import { Text } from './text';

/**
 * What a screen shows when it has no content to show: it is loading, it failed,
 * or there is nothing. Every screen uses these, so they look and read the same
 * everywhere.
 */

type LoadingStateProps = {
  /**
   * The shape of what is coming: a list's rows, or a lone spinner for a screen
   * with no shape yet. A screen of its own shape (Home) draws its skeletons
   * itself, from `Skeleton`.
   */
  shape?: 'rows' | 'spinner';
  /** Rows with a thumbnail at the start. */
  leading?: boolean;
  /** How many rows are on their way, when a screen knows: a preview of three. */
  rows?: number;
  className?: string;
};

/** Loading: skeletons in the shape of what is on its way, so a screen never jumps when it arrives. */
export function LoadingState({
  shape = 'rows',
  leading = false,
  rows,
  className,
}: LoadingStateProps) {
  const t = useTranslations('common');
  // A value, not a class: the browser preview draws the first screen before its stylesheet is read.
  const muted = useCSSVariable('--color-muted');

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading')}
      className={cn(
        'flex-1 bg-background',
        shape === 'spinner' ? 'items-center justify-center' : 'px-4 pt-2',
        className
      )}>
      {shape === 'rows' ? <SkeletonRows rows={rows} leading={leading} /> : null}
      {shape === 'spinner' ? <ActivityIndicator color={muted ? String(muted) : undefined} /> : null}
    </View>
  );
}

type EmptyStateProps = {
  title: string;
  body?: string;
  /** The icon of what is missing: the orders', the inbox's. */
  icon?: IconName;
  /** At most one way on, usually a secondary button. */
  action?: ReactNode;
  /**
   * `top` in a list under its filters, so the filters stay in reach;
   * `center` on a whole screen.
   */
  placement?: 'top' | 'center';
  className?: string;
};

/** Nothing to show: a line icon, a line, a quieter line. No illustration: it could not follow the store's colours. */
export function EmptyState({
  title,
  body,
  icon = 'inbox',
  action,
  placement = 'center',
  className,
}: EmptyStateProps) {
  return (
    <View
      className={cn(
        'items-center px-8',
        placement === 'center' ? 'flex-1 justify-center py-8' : 'pt-16 pb-8',
        className
      )}>
      <View className="max-w-[320px] items-center gap-2">
        <Icon name={icon} size={40} colorClassName="accent-muted" strokeWidth={1.5} />
        <Text variant="subheading" className="mt-2 text-center">
          {title}
        </Text>
        {body ? <Text className="text-center text-muted">{body}</Text> : null}
        {action ? <View className="mt-4">{action}</View> : null}
      </View>
    </View>
  );
}

type ErrorStateProps = {
  /** What went wrong, worded by `useErrorMessage`. */
  error: unknown;
  onRetry?: () => void;
  /** A second way out: "Sign out" when even the account cannot be read. */
  secondary?: ReactNode;
  className?: string;
};

/** A screen that could not load: an alert in a `danger` tint, what happened, and "Try again". */
export function ErrorState({ error, onRetry, secondary, className }: ErrorStateProps) {
  const t = useTranslations('common');
  const describe = useErrorMessage();

  return (
    <View className={cn('flex-1 items-center justify-center px-8 py-8', className)}>
      <View className="max-w-[320px] items-center gap-2">
        <IconCircle icon="alert-circle" tone="danger" size="lg" />
        <Text variant="subheading" accessibilityRole="header" className="mt-3 text-center">
          {t('errorTitle')}
        </Text>
        <Text className="text-center text-muted" accessibilityLiveRegion="polite">
          {describe(error)}
        </Text>
        {onRetry || secondary ? (
          <View className="mt-4 items-center gap-3">
            {onRetry ? (
              <Button label={t('retry')} variant="secondary" icon="refresh" onPress={onRetry} />
            ) : null}
            {secondary}
          </View>
        ) : null}
      </View>
    </View>
  );
}

type InlineErrorProps = {
  error: unknown;
  onRetry: () => void;
  className?: string;
};

/**
 * A list that shows rows and could not load more, or refresh: one line and
 * "Try again" at the list's end. The rows stay.
 */
export function InlineError({ error, onRetry, className }: InlineErrorProps) {
  const t = useTranslations('common');
  const describe = useErrorMessage();

  return (
    <View
      accessibilityRole="alert"
      className={cn('items-center gap-2 rounded-xl bg-surface px-4 py-4', className)}>
      <Text className="text-center text-muted">{describe(error)}</Text>
      <TextLink label={t('retry')} onPress={onRetry} />
    </View>
  );
}

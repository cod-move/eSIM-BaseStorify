import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';

import { AppImage } from '@/components/ui/app-image';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { CountdownBlock, HomeCta, HomePaint } from '@/contracts/mobile/shop/v1';
import { ProductCard } from '@/features/catalog/product-card';
import { useCardActions } from '@/features/catalog/use-add-from-card';
import { useOpenLink } from '@/features/config/use-open-link';
import { cn } from '@/lib/cn';

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };

/**
 * What is left until `endsAt`, in whole units. Null once the time has passed,
 * and when `endsAt` is not a time at all: there is nothing to count down to.
 */
export function timeLeft(endsAt: string, now: number): TimeLeft | null {
  const end = Date.parse(endsAt);
  if (Number.isNaN(end) || end <= now) return null;

  const secondsLeft = Math.floor((end - now) / 1000);
  return {
    days: Math.floor(secondsLeft / 86_400),
    hours: Math.floor(secondsLeft / 3_600) % 24,
    minutes: Math.floor(secondsLeft / 60) % 60,
    seconds: secondsLeft % 60,
  };
}

// The longest a timer can wait: a longer one fires at once.
const LONGEST_WAIT_MS = 2 ** 31 - 1;

/**
 * Whether `endsAt` has passed, turning true at the moment it does, so a block
 * that advertises an offer hides itself when the offer is over. A time the app
 * cannot read never ends.
 */
export function useHasEnded(endsAt: string | undefined): boolean {
  const end = endsAt === undefined ? Number.NaN : Date.parse(endsAt);
  const [now, setNow] = useState(Date.now);
  const ended = end <= now;

  useEffect(() => {
    if (Number.isNaN(end) || ended) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(end - Date.now(), LONGEST_WAIT_MS));
    return () => clearTimeout(timer);
  }, [end, ended, now]);

  return ended;
}

/** The time now, again every second while `endsAt` is ahead. */
function useClock(endsAt: string): number {
  const [now, setNow] = useState(Date.now);
  const running = timeLeft(endsAt, now) !== null;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return now;
}

/**
 * A surface painted as the store asks: a linear gradient, or a colour. A radial
 * gradient, which the app cannot draw, gives way to its first colour.
 */
export function Paint({
  paint,
  className,
  children,
}: {
  paint: HomePaint | undefined;
  className?: string;
  children: ReactNode;
}) {
  const gradient = paint?.gradient;
  const [first, second, ...rest] = gradient?.stops ?? [];
  const linear = gradient?.kind === 'LINEAR' && first && second ? gradient : undefined;
  const color = paint?.color ?? first?.color;

  // A CSS angle: 0° points up, 90° to the right.
  const radians = ((linear?.angle ?? 180) * Math.PI) / 180;
  const dx = Math.sin(radians) / 2;
  const dy = -Math.cos(radians) / 2;

  return (
    <View
      className={cn('overflow-hidden', color ? null : 'bg-surface', className)}
      style={color && !linear ? { backgroundColor: color } : undefined}>
      {linear && first && second ? (
        <LinearGradient
          colors={[first.color, second.color, ...rest.map((stop) => stop.color)]}
          locations={[first.at / 100, second.at / 100, ...rest.map((stop) => stop.at / 100)]}
          start={{ x: 0.5 - dx, y: 0.5 - dy }}
          end={{ x: 0.5 + dx, y: 0.5 + dy }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {children}
    </View>
  );
}

/** A deadline, counted down to the second, with what it is about. Gone once it has passed. */
export function Countdown({ block }: { block: CountdownBlock }) {
  const now = useClock(block.endsAt);
  const left = timeLeft(block.endsAt, now);
  if (!left) return null;

  return block.layout === 'DEALS' ? (
    <Deals block={block} left={left} />
  ) : (
    <Strip block={block} left={left} />
  );
}

type PartProps = { block: CountdownBlock; left: TimeLeft };

function Strip({ block, left }: PartProps) {
  const color = block.textColor ? { color: block.textColor } : undefined;

  return (
    <View className="mx-4 overflow-hidden rounded-2xl bg-surface">
      {block.image ? (
        <AppImage
          image={block.image}
          size="full"
          className="absolute inset-0"
          contentFit="cover"
          decorative
        />
      ) : null}
      <View className="items-center gap-3 px-4 py-5">
        <Words block={block} color={color} center />
        <Clock left={left} />
        {block.cta ? <Cta cta={block.cta} /> : null}
      </View>
    </View>
  );
}

function Deals({ block, left }: PartProps) {
  const cardActions = useCardActions();
  const color = block.textColor ? { color: block.textColor } : undefined;

  return (
    <Paint paint={block.background} className="mx-4 gap-4 rounded-2xl py-5">
      <View className="gap-3 px-4">
        <Words block={block} color={color} />
        <Clock left={left} />
      </View>
      {block.products.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 px-4">
          {block.products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              className="w-40"
              {...cardActions(product)}
            />
          ))}
        </ScrollView>
      ) : null}
      {block.cta ? (
        <View className="px-4">
          <Cta cta={block.cta} />
        </View>
      ) : null}
    </Paint>
  );
}

function Words({
  block,
  color,
  center = false,
}: {
  block: CountdownBlock;
  color: { color: string } | undefined;
  center?: boolean;
}) {
  const align = center ? 'text-center' : undefined;

  return (
    <View className={cn('gap-1', center ? 'items-center' : 'items-start')}>
      {block.heading ? (
        <Text variant="heading" accessibilityRole="header" className={align} style={color}>
          {block.heading}
        </Text>
      ) : null}
      {block.subheading ? (
        <Text variant="body" className={align} style={color}>
          {block.subheading}
        </Text>
      ) : null}
      {block.savingsLabel ? (
        <Text variant="label" className={cn('text-sale', align)}>
          {block.savingsLabel}
        </Text>
      ) : null}
    </View>
  );
}

const UNITS = ['days', 'hours', 'minutes', 'seconds'] as const;

function Clock({ left }: { left: TimeLeft }) {
  const t = useTranslations('home.countdown');
  const format = useFormatter();

  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={t('endsIn', left)}
      className="flex-row gap-2">
      {UNITS.map((unit) => (
        <View key={unit} className="min-w-14 items-center rounded-lg bg-primary px-2 py-1.5">
          <Text variant="price-large" className="text-primary-foreground">
            {format.number(left[unit], { minimumIntegerDigits: 2 })}
          </Text>
          <Text variant="caption" className="text-primary-foreground">
            {t(unit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Cta({ cta }: { cta: HomeCta }) {
  const openLink = useOpenLink();
  const { href } = cta;
  if (!href) return null;

  return <Button label={cta.label} size="sm" onPress={() => openLink(href)} />;
}

import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useFormatter, useTranslations } from 'use-intl';

import { CountBadge } from '@/components/ui/badge';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressableScale, ROUND_PRESS_SCALE } from '@/components/ui/press-motion';
import { Price } from '@/components/ui/price';
import { Text } from '@/components/ui/text';
import type { HomeCollectionTrend, HomeTile, Money } from '@/contracts/mobile/biz/v1';
import { WorkspaceHeader } from '@/features/workspace/workspace-header';
import { useRtl } from '@/i18n/use-rtl';
import { withOpacity } from '@/theme/color';

import { CollectionChart, CollectionChartUnavailable, noonOf } from './collection-chart';
import { HomeQuickActions } from './home-actions';
import { HOME_TILES } from './home-tiles';

/** The graph's tracks on its card. */
const CARD_CHART_HEIGHT = 96;

type HomeHeroProps = {
  /** The collected tiles, in the store's order: the first is the lead figure. */
  tiles: HomeTile[];
  trend?: HomeCollectionTrend;
  /** The UTC day the store calls today (GET /home `day`). */
  today?: string;
  /** Home is on its way, for an operator who may see what was collected: quiet blocks in the figures' places. */
  loading: boolean;
  /** The operator hides the amounts (the eye): dots in their place. */
  hidden: boolean;
  onToggleHidden: () => void;
  /** Unread notifications, on the bell. */
  unread?: number;
};

/**
 * Home's header, as a banking app's: the store's
 * `primary` from under the status bar, with the workspace in a translucent
 * pill and the bell; what was collected today in large figures with an eye
 * that hides them; two translucent cards, each the full width (the last seven
 * days as a graph, then this month); and the quick actions as white cards. Everything
 * on the colour is drawn in its foreground, so it reads on any store's brand.
 * Home's sections rise over its lower edge on a sheet.
 */
export function HomeHero({
  tiles,
  trend,
  today,
  loading,
  hidden,
  onToggleHidden,
  unread,
}: HomeHeroProps) {
  const t = useTranslations('home');
  const [lead, ...others] = tiles;
  const mask = hidden ? t('hiddenAmount') : undefined;

  return (
    <View className="overflow-hidden bg-primary pt-safe">
      <Sheen />
      {/* The row of cards runs from edge to edge, so each part brings its own gutter. */}
      <View className="gap-5 pt-3 pb-6">
        <View className="mx-4 flex-row items-center gap-2 rounded-3xl bg-primary-foreground/10 p-1.5 pe-2">
          <View className="min-w-0 flex-1">
            <WorkspaceHeader onBrand />
          </View>
          <BrandButton
            icon="bell"
            label={t('notifications')}
            count={unread}
            onPress={() => router.push('/more/notifications')}
          />
        </View>

        {loading ? (
          <FiguresOnTheirWay />
        ) : lead ? (
          <>
            <LeadFigure
              tile={lead}
              today={today}
              mask={mask}
              hidden={hidden}
              onToggleHidden={onToggleHidden}
            />
            {/* The cards stand one under the other, each the full width: none is cut off. */}
            <View className="gap-3 px-4">
              <View className="rounded-[22px] bg-primary-foreground/10 p-4">
                {trend && today ? (
                  <CollectionChart
                    trend={trend}
                    today={today}
                    height={CARD_CHART_HEIGHT}
                    mask={mask}
                  />
                ) : (
                  <CollectionChartUnavailable height={CARD_CHART_HEIGHT} />
                )}
              </View>
              {others.map((tile) => (
                <FigureCard key={tile.kind} tile={tile} mask={mask} />
              ))}
            </View>
            <View className="flex-row items-center gap-1.5 px-4">
              <Icon name="clock" size={12} colorClassName="accent-primary-foreground" />
              <Text variant="caption" className="shrink text-primary-foreground/70">
                {t('utcNote')}
              </Text>
            </View>
          </>
        ) : null}

        <View className="px-4">
          <HomeQuickActions />
        </View>
      </View>
    </View>
  );
}

/**
 * Light falling on the header from its top end corner, in the colour's own
 * foreground, so it suits any brand; decoration only, it takes no touches.
 */
function Sheen() {
  const rtl = useRtl();
  const light = String(useCSSVariable('--color-primary-foreground') ?? '');
  return (
    <LinearGradient
      colors={[withOpacity(light, 0.18), withOpacity(light, 0.04), withOpacity(light, 0)]}
      locations={[0, 0.45, 0.9]}
      start={{ x: rtl ? 0 : 1, y: 0 }}
      end={{ x: rtl ? 1 : 0, y: 1 }}
      style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
    />
  );
}

/** A round button on the colour: the bell, the eye. */
function BrandButton({
  icon,
  label,
  count,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <PressableScale
      scaleTo={ROUND_PRESS_SCALE}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      className="size-10 items-center justify-center rounded-full bg-primary-foreground/15 active:opacity-80">
      <Icon name={icon} size={20} colorClassName="accent-primary-foreground" />
      <CountBadge count={count ?? 0} className="absolute -end-1 -top-1" />
    </PressableScale>
  );
}

/** An amount on the colour: the store's formatted money, or dots while hidden. */
function Amount({
  money,
  mask,
  variant,
  className,
}: {
  money?: Money;
  mask?: string;
  variant: 'price' | 'price-large' | 'metric-large';
  className?: string;
}) {
  const t = useTranslations('home');
  if (mask || !money) {
    return (
      <Text variant={variant} numberOfLines={1} className={className}>
        {mask ?? t('unavailable')}
      </Text>
    );
  }
  // A long amount shrinks to stay on one line, as a figure should; only a
  // phone can (the browser preview cuts it instead).
  return (
    <Price
      money={money}
      variant={variant}
      adjustsFontSizeToFit
      minimumFontScale={0.5}
      className={className}
    />
  );
}

/**
 * The lead figure: its label, which opens the orders it was collected on, and
 * the UTC day the store counts as today; the amount under them, with the eye
 * that hides Home's amounts at its end.
 */
function LeadFigure({
  tile,
  today,
  mask,
  hidden,
  onToggleHidden,
}: {
  tile: HomeTile;
  today?: string;
  mask?: string;
  hidden: boolean;
  onToggleHidden: () => void;
}) {
  const t = useTranslations('home');
  const format = useFormatter();
  const label = t(`tiles.${tile.kind}`);
  const value = mask ?? tile.money?.formatted ?? t('unavailable');

  return (
    <View className="gap-1 px-4">
      <View className="flex-row items-center justify-between gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('figureLabel', { label, value })}
          onPress={() => router.push(HOME_TILES[tile.kind].href)}
          hitSlop={8}
          className="min-h-8 shrink flex-row items-center gap-1 active:opacity-70">
          <Text variant="chip" numberOfLines={1} className="shrink text-primary-foreground/85">
            {label}
          </Text>
          <Icon
            name="chevron-right"
            size={14}
            colorClassName="accent-primary-foreground"
            directional
          />
        </Pressable>
        {today ? (
          <View className="rounded-full bg-primary-foreground/10 px-2.5 py-1">
            <Text
              variant="caption"
              numberOfLines={1}
              className="font-medium text-primary-foreground/85">
              {format.dateTime(noonOf(today), {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              })}
            </Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center gap-3">
        <Amount
          money={tile.money}
          mask={mask}
          variant="metric-large"
          className="shrink text-primary-foreground"
        />
        <View className="ms-auto">
          <BrandButton
            icon={hidden ? 'eye-off' : 'eye'}
            label={hidden ? t('showAmounts') : t('hideAmounts')}
            selected={hidden}
            onPress={onToggleHidden}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * A second figure (this month) on a translucent card under the graph: its
 * icon, its label over the amount, and a chevron, as it opens the orders.
 */
function FigureCard({ tile, mask }: { tile: HomeTile; mask?: string }) {
  const t = useTranslations('home');
  const spec = HOME_TILES[tile.kind];
  const label = t(`tiles.${tile.kind}`);
  const value = mask ?? tile.money?.formatted ?? t('unavailable');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={t('figureLabel', { label, value })}
      onPress={() => router.push(spec.href)}
      className="flex-row items-center gap-3 rounded-[22px] bg-primary-foreground/10 p-4 active:opacity-80">
      <View className="size-10 items-center justify-center rounded-full bg-primary-foreground/15">
        <Icon name={spec.icon} size={18} colorClassName="accent-primary-foreground" />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="caption" numberOfLines={1} className="text-primary-foreground/75">
          {label}
        </Text>
        <Amount
          money={tile.money}
          mask={mask}
          variant="price-large"
          className="text-primary-foreground"
        />
      </View>
      <Icon name="chevron-right" size={18} colorClassName="accent-primary-foreground" directional />
    </PressableScale>
  );
}

/** The figures' places while Home is on its way: quiet blocks on the colour, never a zero. */
function FiguresOnTheirWay() {
  const t = useTranslations('common');
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('loading')}
      className="gap-5 px-4">
      <View className="gap-2">
        <View className="h-4 w-32 rounded-md bg-primary-foreground/10" />
        <View className="h-10 w-44 rounded-md bg-primary-foreground/10" />
      </View>
      <View className="gap-3">
        <View className="h-[170px] rounded-[22px] bg-primary-foreground/10" />
        <View className="h-[74px] rounded-[22px] bg-primary-foreground/10" />
      </View>
    </View>
  );
}

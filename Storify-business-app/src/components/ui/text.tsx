import { Platform, Text as NativeText, type TextProps as NativeTextProps } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * The type scale. Each entry is one text style; screens
 * name a style and never set a font size themselves.
 *
 * The names and sizes are the shopper app's, with what a work tool adds: the
 * figure on a Home tile (`metric`), a row's second line (`meta`), the label
 * above a group (`section`) and a status chip's word (`status`). Figures are
 * tabular, so digits line up down a list.
 *
 * Text grows with the phone's font size, so a box that holds text never has a
 * fixed height.
 */
const VARIANTS = {
  /** Sign-in and two-step headings, the gate screens. */
  display: 'text-[26px] leading-[32px] font-bold text-foreground',
  /** A tab's own title; the order number on its page. */
  'title-large': 'text-2xl leading-[30px] font-bold text-foreground',
  /** Header and sheet titles. */
  title: 'text-[17px] leading-[22px] font-semibold text-foreground',
  /** Section titles on a long page: "Items", "Timeline". */
  heading: 'text-[18px] leading-[24px] font-bold text-foreground',
  /** Row titles in settings and menus. */
  subheading: 'text-base leading-[22px] font-medium text-foreground',
  body: 'text-[15px] leading-[22px] text-foreground',
  /** Messages, notes, an application's text: text read in paragraphs. */
  long: 'text-[15px] leading-[24px] text-foreground',
  /** Button labels; a list row's first line (an order number, a product's name). */
  label: 'text-[15px] leading-[20px] font-semibold text-foreground',
  /** A total in a row. */
  price: 'text-[15px] leading-[20px] font-bold tabular-nums text-foreground',
  /** An order's total. */
  'price-large': 'text-2xl leading-[30px] font-bold tabular-nums text-foreground',
  /**
   * The figure on a Home tile. Figures this large are set a little tight, as
   * they read best; not in a right-to-left language, where the spacing would
   * pull joined letters apart.
   */
  metric:
    'text-[28px] leading-[34px] font-bold tracking-[-0.5px] rtl:tracking-[0px] tabular-nums text-foreground',
  /** Home's lead figure: what was collected today, on the summary card. */
  'metric-large':
    'text-[40px] leading-[46px] font-bold tracking-[-1px] rtl:tracking-[0px] tabular-nums text-foreground',
  /** A row's second line: the date, the number of items, the customer. */
  meta: 'text-[13px] leading-[18px] text-muted',
  /** The label above a group of rows: "Security", "Preferences". */
  section: 'text-[13px] leading-[18px] font-semibold text-muted',
  /** Footnotes, a field's hint, a time in a thread. */
  caption: 'text-xs leading-4 text-muted',
  /** Filter chip labels. */
  chip: 'text-[13px] leading-[18px] font-medium text-foreground',
  /** A status chip's word. */
  status: 'text-xs leading-4 font-semibold text-foreground',
  /** The digits of a code. */
  code: 'text-2xl leading-[30px] tabular-nums text-foreground',
  /** The active tab's label, beside its icon. */
  tab: 'text-xs leading-4 font-semibold text-foreground',
  /** Count badges. */
  badge: 'text-[10px] leading-3 font-bold tabular-nums text-foreground',
} as const;

export type TextVariant = keyof typeof VARIANTS;

export type TextProps = NativeTextProps & {
  variant?: TextVariant;
};

// Text starts at the reading edge in either direction. On a phone `text-left`
// means "start" once the layout is right-to-left; a browser needs `text-start`.
const START = Platform.OS === 'web' ? 'text-start' : 'text-left';

/** All text in the app. A `className` passed in wins over the variant's. */
export function Text({ variant = 'body', className, ...props }: TextProps) {
  return <NativeText className={cn(START, VARIANTS[variant], className)} {...props} />;
}

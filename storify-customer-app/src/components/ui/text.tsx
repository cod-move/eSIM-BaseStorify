import { Platform, Text as NativeText, type TextProps as NativeTextProps } from 'react-native';

import { cn } from '@/lib/cn';

/**
 * The type scale. Each entry is one text style of the
 * design; screens name a style and never set a font size themselves.
 *
 * Sizes are the design's, raised where they fell below what the platforms
 * recommend. Text grows with the phone's font size, so a box that holds text
 * never has a fixed height.
 */
const VARIANTS = {
  /** Sign-in headings, "Payment Successful!", a category's name on its own page. */
  display: 'text-[26px] leading-[32px] font-bold text-foreground',
  /** The product's name on the product page. */
  'title-large': 'text-[22px] leading-[28px] font-medium text-foreground',
  /** Header and sheet titles. */
  title: 'text-[17px] leading-[22px] font-semibold text-foreground',
  /** Section titles: "Featured Products", "Payment Method". */
  heading: 'text-[18px] leading-[24px] font-bold text-foreground',
  /** Row titles, card titles, option names. */
  subheading: 'text-base leading-[22px] font-medium text-foreground',
  body: 'text-[15px] leading-[22px] text-foreground',
  /** Policies, descriptions, reviews: text read in paragraphs. */
  long: 'text-[15px] leading-[24px] text-foreground',
  /** Button labels, specification names, review titles. */
  label: 'text-[15px] leading-[20px] font-semibold text-foreground',
  /** A price on a card or a line. */
  price: 'text-[15px] leading-[20px] font-bold text-foreground',
  /** The product page's price and the totals. */
  'price-large': 'text-2xl leading-[30px] font-bold text-foreground',
  /** The digits of a code. */
  code: 'text-2xl leading-[30px] text-foreground',
  /** A product's name on a card. */
  product: 'text-[13px] leading-[18px] font-medium text-foreground',
  caption: 'text-xs leading-4 text-muted',
  chip: 'text-[13px] leading-[18px] font-medium text-foreground',
  tab: 'text-xs leading-4 font-semibold text-foreground',
  badge: 'text-[10px] leading-3 font-bold text-foreground',
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

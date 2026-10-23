import type { IconName } from '@/components/ui/icon';
import type { IconCircleTone } from '@/components/ui/icon-circle';

type NotificationKind = { icon: IconName; tone: IconCircleTone };

/**
 * What a notification is about, by the store's word for it (`order_status`,
 * `chat_message`, `store_credit` …): its icon, and the tint behind it. Green
 * for something done in the shopper's favour, amber for something that asks
 * for a look, the store's accent for news; a word the app does not know is a
 * plain bell.
 */
export function notificationKind(type: string): NotificationKind {
  const kind = type.toLowerCase();
  if (kind.includes('delivered')) return { icon: 'delivered', tone: 'success' };
  if (kind.includes('credit')) return { icon: 'wallet', tone: 'success' };
  if (kind.includes('payment')) return { icon: 'card', tone: 'success' };
  if (kind.includes('coupon')) return { icon: 'ticket', tone: 'success' };
  if (kind.includes('return')) return { icon: 'return', tone: 'warning' };
  if (kind.includes('quote')) return { icon: 'tag', tone: 'warning' };
  if (kind.includes('chat') || kind.includes('message')) return { icon: 'chat', tone: 'accent' };
  if (kind.includes('review')) return { icon: 'star', tone: 'accent' };
  if (kind === 'order_placed') return { icon: 'order-placed', tone: 'accent' };
  if (kind.includes('order')) return { icon: 'truck', tone: 'accent' };
  return { icon: 'bell', tone: 'neutral' };
}

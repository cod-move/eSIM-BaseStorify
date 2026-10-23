import { useTranslations } from 'use-intl';

import { Banner } from '@/components/ui/banner';
import { useOpenDashboard } from '@/features/web/use-open-page';

import { useWorkspace } from './use-workspace';

const STATUSES = new Set(['payment_required', 'pending', 'suspended', 'rejected']);

/**
 * A seller whose shop is not open (`vendor.active: false`): the app keeps
 * what their capabilities allow, and says why the rest is closed, in the
 * store's terms. A shop awaiting payment is settled on the website's
 * dashboard (opened in the app), never in the app's own screens (D-B7).
 */
export function VendorNotice({ className }: { className?: string }) {
  const t = useTranslations('workspace.vendorClosed');
  const common = useTranslations('common');
  const state = useWorkspace();
  const openDashboard = useOpenDashboard();
  if (state.status !== 'ready') return null;
  const vendor = state.access.vendor;
  if (!vendor || vendor.active) return null;

  const status = STATUSES.has(vendor.status)
    ? (vendor.status as 'payment_required' | 'pending' | 'suspended' | 'rejected')
    : 'other';

  return (
    <Banner
      tone={status === 'suspended' || status === 'rejected' ? 'danger' : 'warning'}
      title={t(`${status}.title`)}
      message={t(`${status}.body`)}
      action={openDashboard ? { label: common('openWebsite'), onPress: openDashboard } : undefined}
      className={className}
    />
  );
}

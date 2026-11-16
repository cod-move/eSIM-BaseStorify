import type { StatusTone } from '@/components/ui/status-chip';

/** A tone the server sent, as one the status chips draw; anything else is neutral. */
export function toneOf(tone: string | undefined): StatusTone {
  return tone === 'info' || tone === 'success' || tone === 'warning' || tone === 'danger'
    ? tone
    : 'neutral';
}

/** Data as people say it: 512 MB, 1.5 GB. */
export function bytesLabel(bytes: number | undefined | null): string | null {
  if (bytes === undefined || bytes === null || !Number.isFinite(bytes)) return null;
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
  }
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/** The supplier's display name from its code. */
const SUPPLIERS: Record<string, string> = {
  esimaccess: 'eSIM Access',
  stellar: 'Stellar',
  roamwifi: 'RoamWifi',
  bnesim: 'BNESIM',
  mobimatter: 'MobiMatter',
  topconnect: 'TopConnect',
};
export function supplierName(code: string | undefined): string {
  if (!code) return '';
  return SUPPLIERS[code] ?? code;
}

/** Problem and top-up states that are bad news, waiting, or fine. */
export function stateTone(state: string): StatusTone {
  if (state === 'failed') return 'danger';
  if (
    state === 'review' ||
    state === 'provider_pending' ||
    state === 'queued' ||
    state === 'processing' ||
    state === 'purchasing'
  )
    return 'warning';
  if (state === 'delivered' || state === 'fulfilled' || state === 'completed') return 'success';
  return 'neutral';
}

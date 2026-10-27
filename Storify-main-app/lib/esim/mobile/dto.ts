import QRCode from "qrcode";
import type { EsimDetail, EsimSummary, EsimUsage } from "@/contracts/mobile/shop/v1/esim";
import { formatBytes, remainingPercent } from "@/lib/esim/account/display";
import type { EsimView } from "@/lib/esim/account/esims";
import { installLinks } from "@/lib/esim/fulfillment/install-links";

/** The website's eSIM view (lib/esim/account/esims.ts) in the mobile contract's shape (APP-03/04). */

const iso = (date: Date | null | undefined) => (date ? new Date(date).toISOString() : undefined);
const amount = (bytes: number) => ({ bytes, formatted: formatBytes(bytes) });

function usageOf(view: EsimView): EsimUsage | undefined {
  const usage = view.usage;
  if (!usage) return undefined;
  const unlimited = view.dataType === "unlimited" || !(usage.totalBytes > 0);
  const percent = unlimited ? null : remainingPercent(usage.totalBytes, usage.remainingBytes);
  return {
    unlimited,
    total: amount(usage.totalBytes),
    used: amount(usage.usedBytes),
    remaining: amount(usage.remainingBytes),
    ...(percent === null ? {} : { remainingPercent: percent }),
    ...(usage.syncedAt ? { syncedAt: iso(usage.syncedAt) } : {}),
    stale: Boolean(usage.stale),
  };
}

export function toEsimSummary(view: EsimView): EsimSummary {
  const usage = usageOf(view);
  return {
    id: view.id,
    planName: view.planName,
    destination: view.destination,
    ...(view.emoji ? { emoji: view.emoji } : {}),
    status: view.display.status,
    tone: view.display.tone,
    ...(view.remark ? { remark: view.remark } : {}),
    ...(view.iccid ? { iccidEnd: view.iccid.slice(-4) } : {}),
    ...(usage ? { usage } : {}),
    ...(view.expiresAt ? { expiresAt: iso(view.expiresAt) } : {}),
  };
}

/** Installing is offered while the eSIM can still be used, and only with a code. */
const INSTALLABLE = new Set(["ready_to_install", "installed", "in_use", "data_used_up", "no_active_package"]);

export async function toEsimDetail(view: EsimView): Promise<EsimDetail> {
  const code = view.installation?.activationCode ?? null;
  const links = installLinks(code);
  return {
    ...toEsimSummary(view),
    orderNumber: view.orderNumber,
    ...(view.iccid ? { iccid: view.iccid } : {}),
    dataLabel: view.dataLabel,
    validityDays: view.validityDays,
    ...(view.fulfilledAt ? { fulfilledAt: iso(view.fulfilledAt) } : {}),
    ...(view.activationDeadline ? { activationDeadline: iso(view.activationDeadline) } : {}),
    ...(view.topupDeadline ? { topupDeadline: iso(view.topupDeadline) } : {}),
    canInstall: view.display.canInstall,
    canTopup: view.display.canTopup,
    ...(code && INSTALLABLE.has(view.display.status)
      ? {
          install: {
            activationCode: code,
            ...(view.installation.smdpAddress ? { smdpAddress: view.installation.smdpAddress } : {}),
            ...(view.installation.matchingId ? { matchingId: view.installation.matchingId } : {}),
            qrImage: await QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: "M" }),
            ...(links ? { iosLink: links.ios, androidLink: links.android } : {}),
            ...(view.installation.apn ? { apn: view.installation.apn } : {}),
          },
        }
      : {}),
    ...(view.customerLink ? { supplierLink: view.customerLink } : {}),
  };
}

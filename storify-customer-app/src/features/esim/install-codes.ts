import type { EsimInstall } from '@/contracts/mobile/shop/v1/esim';

/**
 * The codes the eSIM page offers for entering an eSIM by hand, as the website
 * does: the activation code (the matching id when the supplier gives one, else
 * the code as given) and the whole LPA string, for phones that take it pasted
 * in one piece. Null when there is no LPA string, or it is the code already
 * shown. Pure.
 */
export function installCodes(install: Pick<EsimInstall, 'activationCode' | 'smdpAddress' | 'matchingId'>): {
  activationCode: string;
  lpa: string | null;
} {
  const activationCode = install.matchingId ?? install.activationCode;
  const code = install.activationCode.trim();
  const lpa = code.startsWith('LPA:')
    ? code
    : install.smdpAddress && install.matchingId
      ? `LPA:1$${install.smdpAddress}$${install.matchingId}`
      : null;
  return { activationCode, lpa: lpa && lpa !== activationCode ? lpa : null };
}

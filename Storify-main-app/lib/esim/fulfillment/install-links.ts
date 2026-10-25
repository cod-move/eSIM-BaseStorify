/**
 * One-tap install links for an LPA activation code (USR-03): the URLs Apple
 * (iOS 17.4+) and Android open straight into the eSIM installer. Pure.
 */

export function installLinks(activationCode: string | null): { ios: string; android: string } | null {
  if (!activationCode || !/^LPA:1\$[^$]+\$[^$]+/.test(activationCode)) return null;
  const carddata = encodeURIComponent(activationCode);
  return {
    ios: `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${carddata}`,
    android: `https://esimsetup.android.com/esim_qrcode_provisioning?carddata=${carddata}`,
  };
}

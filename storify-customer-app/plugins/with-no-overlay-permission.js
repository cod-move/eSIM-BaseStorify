const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Keeps "display over other apps" (SYSTEM_ALERT_WINDOW) out of the release
 * APK. The generated main manifest asks for it, the app never uses it, and
 * Android's malware checks treat it as a warning sign. It is marked
 * tools:node="remove" so libraries cannot merge it back in. The debug manifest
 * (dev menu) keeps it.
 */
const PERMISSION = 'android.permission.SYSTEM_ALERT_WINDOW';

module.exports = function withNoOverlayPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const list = (manifest['uses-permission'] ??= []);
    const others = list.filter((item) => item.$['android:name'] !== PERMISSION);
    others.push({ $: { 'android:name': PERMISSION, 'tools:node': 'remove' } });
    manifest['uses-permission'] = others;
    return config;
  });
};

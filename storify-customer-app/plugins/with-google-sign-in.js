const { withPodfile } = require('expo/config-plugins');
const withNitroGoogleSignIn = require('react-native-nitro-google-signin/app.plugin.js');

/**
 * The native side of "Continue with Google" (react-native-nitro-google-signin).
 *
 * With an iOS client ID (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, read in
 * app.config.ts) the library's own plugin runs: it registers the client's
 * reversed ID as a URL scheme, which Google Sign-In on iOS returns to, and adds
 * the pods its Swift code needs. Android needs nothing here: the library links
 * itself, and Google finds the app's Android client by its package name and
 * signing certificate.
 *
 * Without one, the library's plugin refuses to run (it insists on a scheme),
 * but the module is linked all the same and its pods are still needed for the
 * iOS build to compile. So only those are added, as the library adds them, and
 * the app hides the Google button on iOS.
 */
const PODS = [
  "  pod 'AppCheckCore', :modular_headers => true",
  "  pod 'GoogleUtilities', :modular_headers => true",
  "  pod 'RecaptchaInterop', :modular_headers => true",
];
const MARK = '  # with-google-sign-in: the pods Google Sign-In needs';

module.exports = function withGoogleSignIn(config, { iosUrlScheme } = {}) {
  if (iosUrlScheme) return withNitroGoogleSignIn(config, { iosUrlScheme });

  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes(MARK)) return config;
    // Before the line that links the native modules, inside the app's target.
    const anchor = contents.search(/^.*use_native_modules/m);
    if (anchor === -1) {
      throw new Error('with-google-sign-in: ios/Podfile has no use_native_modules! line.');
    }
    config.modResults.contents = `${contents.slice(0, anchor)}${MARK}\n${PODS.join('\n')}\n${contents.slice(anchor)}`;
    return config;
  });
};

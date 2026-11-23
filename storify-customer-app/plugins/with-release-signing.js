const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Signs release builds with CodSIM's own key instead of the public debug key
 * that the generated `android/app/build.gradle` uses. Android's malware checks
 * (Play Protect, Samsung Auto Blocker) flag APKs signed with the debug key.
 *
 * The key is never in the repository. Gradle reads it from the user-level
 * `~/.gradle/gradle.properties`:
 *
 *   CODSIM_STORE_FILE=C:/b/keys/codsim-release.keystore
 *   CODSIM_KEY_ALIAS=codsim
 *   CODSIM_STORE_PASSWORD=...
 *   CODSIM_KEY_PASSWORD=...
 *
 * A release build stops with an error when they are missing, so it never falls
 * back to the debug key. Debug builds are unchanged.
 */
const MARKER = '// [codsim] release signing';

const RELEASE_CONFIG = `
        ${MARKER}
        release {
            def names = ['CODSIM_STORE_FILE', 'CODSIM_KEY_ALIAS', 'CODSIM_STORE_PASSWORD', 'CODSIM_KEY_PASSWORD']
            def missing = names.findAll { !project.hasProperty(it) }
            if (missing.isEmpty()) {
                storeFile file(CODSIM_STORE_FILE)
                storePassword CODSIM_STORE_PASSWORD
                keyAlias CODSIM_KEY_ALIAS
                keyPassword CODSIM_KEY_PASSWORD
            } else if (gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') }) {
                throw new GradleException("Release signing key not set; add to ~/.gradle/gradle.properties: " + missing.join(', '))
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let gradle = config.modResults.contents;
    if (gradle.includes(MARKER)) return config;

    const signingStart = gradle.indexOf('signingConfigs {');
    if (signingStart < 0) throw new Error('with-release-signing: signingConfigs block not found');
    const insertAt = signingStart + 'signingConfigs {'.length;
    gradle = gradle.slice(0, insertAt) + RELEASE_CONFIG + gradle.slice(insertAt);

    const releaseStart = gradle.indexOf('release {', gradle.indexOf('buildTypes {'));
    if (releaseStart < 0) throw new Error('with-release-signing: release build type not found');
    const debugRef = gradle.indexOf('signingConfig signingConfigs.debug', releaseStart);
    if (debugRef < 0) throw new Error('with-release-signing: release signingConfig not found');
    gradle =
      gradle.slice(0, debugRef) +
      'signingConfig signingConfigs.release' +
      gradle.slice(debugRef + 'signingConfig signingConfigs.debug'.length);

    config.modResults.contents = gradle;
    return config;
  });
};

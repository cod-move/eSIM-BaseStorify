const { withGradleProperties } = require('expo/config-plugins');

/**
 * Gives Gradle more memory than the generated `android/gradle.properties`
 * (`-Xmx2048m -XX:MaxMetaspaceSize=512m`). With this app's native modules, a
 * release build ran out of metaspace in expo-updates' code generation (KSP).
 * The Kotlin daemon takes the same limits from Gradle. Other flags in the line
 * are kept.
 */
const LIMITS = ['-Xmx4096m', '-XX:MaxMetaspaceSize=1536m'];

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (config) => {
    const line = config.modResults.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs'
    );
    const others = (line?.value ?? '')
      .split(/\s+/)
      .filter((arg) => arg && !arg.startsWith('-Xmx') && !arg.startsWith('-XX:MaxMetaspaceSize='));
    const value = [...LIMITS, ...others].join(' ');

    if (line) line.value = value;
    else config.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value });
    return config;
  });
};

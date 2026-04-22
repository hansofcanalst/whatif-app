// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v10 uses the `exports` field with a `react-native` condition to
// serve its RN-specific auth bundle. Without this flag Metro picks the browser
// bundle, so `getReactNativePersistence` is undefined and `initializeAuth`
// silently fails, which surfaces later as:
//   "Component auth has not been registered yet"
config.resolver.unstable_enablePackageExports = true;

// Prefer the `react-native` condition when resolving package exports.
config.resolver.unstable_conditionNames = ['require', 'react-native', 'browser'];

// Firebase ships some .cjs files that Metro's default sourceExts miss.
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs'];

module.exports = config;

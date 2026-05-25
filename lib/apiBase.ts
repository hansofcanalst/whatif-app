import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { config } from '@/constants/config';

/**
 * Resolve the base URL for app-internal API endpoints (`/api/*+api.ts`).
 *
 * Precedence:
 *   1. EXPO_PUBLIC_CLOUD_FUNCTIONS_URL — production: hit the deployed
 *      Cloud Function. Returns the configured URL as-is; callers append
 *      `/detect` or `/generate`.
 *   2. Web dev — return '' so a relative URL like `/api/detect`
 *      resolves against the Metro dev server origin (the page).
 *   3. Native dev (iOS / Android dev build or Expo Go) — return the
 *      Metro dev server origin derived from `Constants.expoConfig.hostUri`
 *      (e.g. "192.168.3.72:8081" → "http://192.168.3.72:8081"). React
 *      Native's fetch hands relative URLs straight to NSURLSession /
 *      OkHttp, neither of which can resolve them — every call would
 *      surface as `TypeError: Network request failed`.
 *
 * Throws when called on native without either a cloud-functions URL or
 * a dev-server host — that combination means a release build pointed at
 * nothing, and a loud failure beats silent fetch errors.
 */
export function resolveApiBase(): string {
  const cloud = config.cloudFunctions.baseURL?.trim();
  if (cloud) return cloud.replace(/\/+$/, '');

  if (Platform.OS === 'web') return '';

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    // hostUri is "<host>:<port>" in dev; tolerate a stray scheme just
    // in case some future Expo version returns a full URL.
    const withScheme = /^https?:\/\//i.test(hostUri) ? hostUri : `http://${hostUri}`;
    return withScheme.replace(/\/+$/, '');
  }

  throw new Error(
    'No API base URL available. Set EXPO_PUBLIC_CLOUD_FUNCTIONS_URL for ' +
      'production builds, or run the app via the Expo dev server so ' +
      'Constants.expoConfig.hostUri is populated.',
  );
}

/** True when we're targeting the local Expo Router API routes (no
 *  cloud-functions URL configured). Callers use this to skip the
 *  Firebase Bearer token, which the local dev endpoints don't expect. */
export function isLocalDevApi(): boolean {
  return !config.cloudFunctions.baseURL?.trim();
}

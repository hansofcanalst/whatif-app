import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { config } from '@/constants/config';

/**
 * Resolve the base URL for app-internal API endpoints (`/api/*+api.ts`).
 *
 * Precedence:
 *   1. EXPO_PUBLIC_CLOUD_FUNCTIONS_URL — production: hit the deployed
 *      Cloud Function.
 *   2. Web dev — '' so relative URLs like `/api/detect` resolve against
 *      the Metro dev-server origin (the page itself).
 *   3. Native dev — derive the Metro origin from whichever of these is
 *      actually populated for the build/launch path we're in:
 *        a. `Constants.expoConfig.hostUri` — set when the manifest was
 *           fetched from `expo start` (works for most dev clients).
 *        b. `Constants.expoGoConfig.debuggerHost` — Expo Go only.
 *        c. `NativeModules.SourceCode.scriptURL` — the URL React Native
 *           itself used to fetch the JS bundle. This is the most
 *           reliable fallback: a debug build *must* have loaded the
 *           bundle from Metro, so this is always populated in dev. We
 *           ignore the `file://` form (release bundle on disk).
 *        d. `Constants.experienceUrl` — `exp://host:port` in dev as a
 *           last resort.
 *
 *   `expo run:ios` builds occasionally land with `hostUri` empty (e.g.
 *   when the build script logs "Skipping dev server" and the dev client
 *   later attaches to a separately-started `npm start`). The bundle URL
 *   from RN's SourceCode module covers that gap.
 *
 * Throws when called on native without either a cloud-functions URL or
 * any detectable dev-server host — that means a release-style build
 * pointed at nothing, and a loud failure beats silent fetch errors.
 */
export function resolveApiBase(): string {
  const cloud = config.cloudFunctions.baseURL?.trim();
  if (cloud) return cloud.replace(/\/+$/, '');

  if (Platform.OS === 'web') return '';

  // (a) Manifest hostUri — usual happy path.
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) return hostUriToOrigin(hostUri);

  // (b) Expo Go.
  const debuggerHost = (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost;
  if (debuggerHost) return hostUriToOrigin(debuggerHost);

  // (c) React Native bridge — most reliable for `expo run:ios` builds.
  const scriptOrigin = originFromScriptURL();
  if (scriptOrigin) return scriptOrigin;

  // (d) experienceUrl — `exp://host:port` in dev.
  const experienceUrl = Constants.experienceUrl;
  if (typeof experienceUrl === 'string' && experienceUrl) {
    const origin = originFromUrl(experienceUrl);
    if (origin) return origin;
  }

  throw new Error(
    'No API base URL available. Set EXPO_PUBLIC_CLOUD_FUNCTIONS_URL for ' +
      'production builds, or launch a Metro dev server (`npm start`) ' +
      "before opening the dev build so the bundle's host can be detected.",
  );
}

/** True when we're targeting the local Expo Router API routes (no
 *  cloud-functions URL configured). Callers use this to skip the
 *  Firebase Bearer token, which the local dev endpoints don't expect. */
export function isLocalDevApi(): boolean {
  return !config.cloudFunctions.baseURL?.trim();
}

/** Convert a `host:port` (or accidental full URL) into an `http(s)://host:port` origin. */
function hostUriToOrigin(hostUri: string): string {
  const trimmed = hostUri.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^exps?:\/\//i.test(trimmed)) {
    // exp:// → http://, exps:// → https://
    return trimmed.replace(/^exp/i, 'http');
  }
  return `http://${trimmed}`;
}

/** Pull `<scheme>://<host>[:<port>]` out of any URL; map exp(s) → http(s).
 *  Returns null for non-network schemes (e.g. `file://`). */
function originFromUrl(url: string): string | null {
  const match = url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i);
  if (!match) return null;
  const rawScheme = match[1].toLowerCase();
  const host = match[2];
  let scheme: string;
  if (rawScheme === 'http' || rawScheme === 'exp') scheme = 'http';
  else if (rawScheme === 'https' || rawScheme === 'exps') scheme = 'https';
  else return null;
  return `${scheme}://${host}`;
}

function originFromScriptURL(): string | null {
  try {
    const sourceCode = (NativeModules as { SourceCode?: { getConstants?: () => { scriptURL?: string }; scriptURL?: string } }).SourceCode;
    const scriptURL = sourceCode?.getConstants?.().scriptURL ?? sourceCode?.scriptURL;
    if (typeof scriptURL === 'string' && scriptURL) return originFromUrl(scriptURL);
  } catch {
    // Bridge unavailable (web, edge cases) — fall through.
  }
  return null;
}

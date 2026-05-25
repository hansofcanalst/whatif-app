// Server-side trend resolution for the LOCAL DEV API route
// (`app/api/generate+api.ts`). The production Cloud Function uses
// `functions/src/trends.ts` (firebase-admin). Both implementations MUST
// return the same shape and apply the same active/window check — they
// are the trust-boundary that gates the canonical promptTemplate.
//
// Why a separate file: `lib/firebase.ts` pulls in
// `@react-native-async-storage/async-storage`, which can't run under
// Node. We use the Firestore REST API directly here — no SDK init
// needed, no client-bundle bloat, and we read public-active trends
// without an auth token (rules allow it).
//
// SECURITY POSTURE:
//   1. The client sends a `trendId` (untrusted).
//   2. This module fetches the trend doc by id and returns its
//      server-resolved fields, INCLUDING the canonical promptTemplate.
//      The caller MUST use that prompt, not anything the client sent.
//   3. We refuse trends that are inactive or outside their date window —
//      the same active==true rule the Firestore rules apply, mirrored
//      server-side so a client with a cached "live" trend that just
//      expired can't sneak past.

import type { TrendingDoc } from './trends';

interface FirestoreRestValue {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  timestampValue?: string;
  nullValue?: null;
  arrayValue?: { values?: FirestoreRestValue[] };
  mapValue?: { fields?: Record<string, FirestoreRestValue> };
}

interface FirestoreRestDocument {
  name: string;
  fields?: Record<string, FirestoreRestValue>;
  createTime?: string;
  updateTime?: string;
}

/**
 * Decode a single Firestore REST value into a JS primitive. Handles the
 * union of types we expect to find in a trending doc (strings, numbers,
 * bools, timestamps, string arrays). Returns undefined for unsupported
 * shapes; coerceTrendFromRest below treats undefined as "missing".
 */
function decodeValue(v: FirestoreRestValue | undefined): unknown {
  if (!v) return undefined;
  if ('stringValue' in v && v.stringValue !== undefined) return v.stringValue;
  if ('booleanValue' in v && v.booleanValue !== undefined) return v.booleanValue;
  if ('integerValue' in v && v.integerValue !== undefined) return Number(v.integerValue);
  if ('doubleValue' in v && v.doubleValue !== undefined) return v.doubleValue;
  if ('timestampValue' in v && v.timestampValue !== undefined) {
    return new Date(v.timestampValue);
  }
  if ('nullValue' in v) return null;
  if ('arrayValue' in v && v.arrayValue) {
    return (v.arrayValue.values ?? []).map(decodeValue);
  }
  return undefined;
}

/**
 * Server-side TrendingDoc shape. Identical to the client TrendingDoc
 * except Timestamps are flattened to Date objects since this module
 * runs under Node where the firebase/firestore Timestamp class isn't
 * naturally available. Callers should treat startDate/endDate as Date.
 */
export interface ServerTrendingDoc {
  id: string;
  label: string;
  emoji: string;
  subtitle: string;
  promptTemplate: string;
  gradientColors: string[];
  isPremium: boolean;
  sensitiveCategory: boolean;
  active: boolean;
  sortOrder: number;
  startDate: Date | null;
  endDate: Date | null;
}

function coerceTrendFromRest(id: string, doc: FirestoreRestDocument): ServerTrendingDoc | null {
  const fields = doc.fields ?? {};
  const label = decodeValue(fields.label);
  const promptTemplate = decodeValue(fields.promptTemplate);
  if (typeof label !== 'string' || typeof promptTemplate !== 'string') return null;
  const gradient = decodeValue(fields.gradientColors);
  const startDate = decodeValue(fields.startDate);
  const endDate = decodeValue(fields.endDate);
  return {
    id,
    label,
    emoji: typeof decodeValue(fields.emoji) === 'string' ? (decodeValue(fields.emoji) as string) : '✨',
    subtitle: typeof decodeValue(fields.subtitle) === 'string' ? (decodeValue(fields.subtitle) as string) : '',
    promptTemplate,
    gradientColors: Array.isArray(gradient)
      ? (gradient.filter((c) => typeof c === 'string') as string[])
      : ['#7c3aed', '#ec4899'],
    isPremium: decodeValue(fields.isPremium) === true,
    sensitiveCategory: decodeValue(fields.sensitiveCategory) === true,
    active: decodeValue(fields.active) === true,
    sortOrder: typeof decodeValue(fields.sortOrder) === 'number' ? (decodeValue(fields.sortOrder) as number) : 0,
    startDate: startDate instanceof Date ? startDate : null,
    endDate: endDate instanceof Date ? endDate : null,
  };
}

/**
 * Apply the same "is this trend currently usable" check the client
 * applies. Refusing inactive or out-of-window trends server-side
 * prevents a client with a stale cache from generating against a
 * pulled trend.
 */
export function isServerTrendLive(t: ServerTrendingDoc, now: Date = new Date()): boolean {
  if (!t.active) return false;
  if (t.startDate && t.startDate > now) return false;
  if (t.endDate && t.endDate < now) return false;
  return true;
}

export class TrendNotFoundError extends Error {
  constructor(trendId: string) {
    super(`trend ${trendId} not found`);
    this.name = 'TrendNotFoundError';
  }
}

export class TrendNotLiveError extends Error {
  constructor(trendId: string) {
    super(`trend ${trendId} is not active or is out of its date window`);
    this.name = 'TrendNotLiveError';
  }
}

/**
 * Fetch a single trending doc by id via the Firestore REST API. The
 * `trending` collection is publicly readable (firestore.rules), so we
 * don't need an auth token — direct HTTP GET works.
 *
 * Throws TrendNotFoundError on 404, TrendNotLiveError when active==false
 * or the doc is outside its date window, and a generic Error for any
 * other HTTP failure. Callers in the generate handler should map these
 * to 404 / 410 / 500 respectively.
 */
export async function fetchServerTrend(trendId: string): Promise<ServerTrendingDoc> {
  const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('EXPO_PUBLIC_FIREBASE_PROJECT_ID not set — cannot resolve trend.');
  }
  // Basic id validation — trendIds are collection-doc paths, so any
  // slash or special char would let a malicious client read a different
  // collection. We restrict to a conservative charset.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(trendId)) {
    throw new TrendNotFoundError(trendId);
  }
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/trending/${encodeURIComponent(trendId)}`;
  const res = await fetch(url);
  if (res.status === 404) throw new TrendNotFoundError(trendId);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`trend fetch failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as FirestoreRestDocument;
  const trend = coerceTrendFromRest(trendId, json);
  if (!trend) throw new TrendNotFoundError(trendId);
  if (!isServerTrendLive(trend)) throw new TrendNotLiveError(trendId);
  return trend;
}

// Remote-updatable "Trending This Week" transformations.
//
// Architecture (see PROJECT_OVERVIEW.md "Trending categories" for the
// full spec):
//
//   1. Admin authors a doc under Firestore `trending/{trendId}` (via
//      scripts/add-trend.js or the Firebase console).
//   2. Clients fetch `trending` where active==true on every home-screen
//      mount + pull-to-refresh. Result is cached to AsyncStorage so an
//      offline launch shows the last-known trends instead of an empty
//      carousel.
//   3. On selection, the client sends only `trendId` to the generate
//      endpoint — NEVER the promptTemplate. The server re-fetches the
//      doc and uses the trusted server-side promptTemplate. A modified
//      client cannot substitute its own prompt.
//   4. Server-side minor-detection gate runs on trends with
//      `sensitiveCategory: true`, mirroring the existing race-swap /
//      gender-swap behavior.
//
// IMPORTANT: This module is the CLIENT face of the system. It reads
// from Firestore using the public-read rule and is safe for the app
// bundle. Server-side prompt resolution lives in
// `lib/trends-server.ts` (local-dev) and `functions/src/trends.ts`
// (production). Keep the TrendingDoc shape in sync across all three.

import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';

/**
 * Shape of a `trending/{trendId}` Firestore document. Fields mirror the
 * spec in PROJECT_OVERVIEW.md exactly.
 *
 * IMPORTANT: clients receive `promptTemplate` over the wire for display
 * purposes ONLY (so the carousel could show a preview if we ever want
 * to). Generation NEVER sends this back to the server — the server
 * re-fetches the canonical value from Firestore by `id`.
 */
export interface TrendingDoc {
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
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  createdAt: Timestamp | null;
}

const TRENDING_COLLECTION = 'trending';
const TRENDING_CACHE_KEY = 'whatif.trending.v1';

/**
 * Validate + coerce a raw Firestore doc into a TrendingDoc. Returns null
 * if any required field is missing or malformed — we never want a
 * malformed admin doc to crash the carousel. Logs the rejection so the
 * dev can fix the source doc.
 */
function coerceTrend(id: string, raw: Record<string, unknown>): TrendingDoc | null {
  const label = typeof raw.label === 'string' ? raw.label : null;
  const promptTemplate = typeof raw.promptTemplate === 'string' ? raw.promptTemplate : null;
  if (!label || !promptTemplate) {
    console.warn(`[trends] dropping malformed trend ${id} — missing label or promptTemplate`);
    return null;
  }
  return {
    id,
    label,
    emoji: typeof raw.emoji === 'string' ? raw.emoji : '✨',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    promptTemplate,
    gradientColors: Array.isArray(raw.gradientColors)
      ? raw.gradientColors.filter((c): c is string => typeof c === 'string')
      : ['#7c3aed', '#ec4899'],
    isPremium: raw.isPremium === true,
    sensitiveCategory: raw.sensitiveCategory === true,
    active: raw.active === true,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
    startDate: raw.startDate instanceof Timestamp ? raw.startDate : null,
    endDate: raw.endDate instanceof Timestamp ? raw.endDate : null,
    createdAt: raw.createdAt instanceof Timestamp ? raw.createdAt : null,
  };
}

/**
 * `startDate`/`endDate` are optional scheduling windows. A trend is
 * "live" when active==true AND (startDate unset or in the past) AND
 * (endDate unset or in the future). Evaluated against the device clock —
 * cheap-and-fine for a marketing carousel, no need to round-trip the
 * server. The server applies the same check on the generate path so a
 * client with a skewed clock can't generate against an out-of-window
 * trend.
 */
export function isTrendLive(t: TrendingDoc, now: Date = new Date()): boolean {
  if (!t.active) return false;
  if (t.startDate && t.startDate.toDate() > now) return false;
  if (t.endDate && t.endDate.toDate() < now) return false;
  return true;
}

/**
 * Fetch active trends from Firestore. Firestore rules limit this query
 * to active==true docs. We sort client-side by sortOrder so the admin
 * has full control over carousel ordering without needing a composite
 * index. Date-window filtering happens client-side via isTrendLive
 * because Firestore can't run that compound query in a single index.
 *
 * Throws on network or permission errors so callers can fall back to
 * cache. Returns an empty array if the collection is empty.
 */
export async function fetchTrendsFromFirestore(): Promise<TrendingDoc[]> {
  // We query active==true here so a paginating client doesn't also pull
  // back inactive docs that would just get filtered out below. orderBy
  // on sortOrder is fine alongside the equality filter without needing
  // a composite index (single field index, default).
  const q = query(
    collection(db, TRENDING_COLLECTION),
    where('active', '==', true),
    orderBy('sortOrder', 'asc'),
  );
  const snap = await getDocs(q);
  const out: TrendingDoc[] = [];
  snap.forEach((doc) => {
    const coerced = coerceTrend(doc.id, doc.data());
    if (coerced) out.push(coerced);
  });
  return out;
}

// ─── AsyncStorage cache ───────────────────────────────────────────────
//
// We store a serializable copy of the most recent successful fetch so
// the carousel renders instantly on cold launch and survives offline.
// Timestamps don't serialize cleanly — we store ms-epoch numbers and
// rehydrate to Timestamp on load.

interface CachedTrend extends Omit<TrendingDoc, 'startDate' | 'endDate' | 'createdAt'> {
  startDateMs: number | null;
  endDateMs: number | null;
  createdAtMs: number | null;
}

interface CachedPayload {
  v: 1;
  fetchedAtMs: number;
  trends: CachedTrend[];
}

function toCached(t: TrendingDoc): CachedTrend {
  return {
    ...t,
    startDateMs: t.startDate ? t.startDate.toMillis() : null,
    endDateMs: t.endDate ? t.endDate.toMillis() : null,
    createdAtMs: t.createdAt ? t.createdAt.toMillis() : null,
  };
}

function fromCached(c: CachedTrend): TrendingDoc {
  return {
    id: c.id,
    label: c.label,
    emoji: c.emoji,
    subtitle: c.subtitle,
    promptTemplate: c.promptTemplate,
    gradientColors: c.gradientColors,
    isPremium: c.isPremium,
    sensitiveCategory: c.sensitiveCategory,
    active: c.active,
    sortOrder: c.sortOrder,
    startDate: c.startDateMs ? Timestamp.fromMillis(c.startDateMs) : null,
    endDate: c.endDateMs ? Timestamp.fromMillis(c.endDateMs) : null,
    createdAt: c.createdAtMs ? Timestamp.fromMillis(c.createdAtMs) : null,
  };
}

export async function loadCachedTrends(): Promise<TrendingDoc[]> {
  try {
    const raw = await AsyncStorage.getItem(TRENDING_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedPayload;
    if (parsed.v !== 1 || !Array.isArray(parsed.trends)) return [];
    return parsed.trends.map(fromCached);
  } catch (e) {
    console.warn('[trends] cache load failed', e);
    return [];
  }
}

export async function persistCachedTrends(trends: TrendingDoc[]): Promise<void> {
  try {
    const payload: CachedPayload = {
      v: 1,
      fetchedAtMs: Date.now(),
      trends: trends.map(toCached),
    };
    await AsyncStorage.setItem(TRENDING_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('[trends] cache persist failed', e);
  }
}

/**
 * Stale-while-revalidate loader. Returns the cached trends synchronously
 * via the first-yield, then resolves to the freshly-fetched list once
 * the network completes. Callers can subscribe to both values.
 *
 * Shape:
 *   const { cached, refresh } = await loadTrendsStaleWhileRevalidate();
 *   // cached: TrendingDoc[] (possibly empty)
 *   // refresh: Promise<TrendingDoc[]>
 *
 * Persists the fresh fetch automatically on success.
 */
export async function loadTrendsStaleWhileRevalidate(): Promise<{
  cached: TrendingDoc[];
  refresh: Promise<TrendingDoc[]>;
}> {
  const cached = await loadCachedTrends();
  const refresh = fetchTrendsFromFirestore()
    .then(async (fresh) => {
      await persistCachedTrends(fresh);
      return fresh;
    })
    .catch((e) => {
      // Network/permission failure — fall back to cache so the UI stays
      // populated. Don't throw out of refresh; the caller is expected
      // to merge the result with `cached` and a thrown error here would
      // surface as an uncaught rejection.
      console.warn('[trends] refresh failed, keeping cached trends', e);
      return cached;
    });
  return { cached, refresh };
}

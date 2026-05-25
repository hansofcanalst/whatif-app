// Cloud Function-side trend resolution. Mirrors lib/trends-server.ts
// (which uses the Firestore REST API for the local-dev route) but goes
// through firebase-admin since we're already inside a privileged
// runtime. Both implementations MUST apply the same active/window
// check — this is the trust boundary that gates the canonical
// promptTemplate against a hostile client.
//
// Keep the ServerTrendingDoc shape and the isServerTrendLive logic in
// sync with lib/trends-server.ts. The duplication is deliberate: the
// local-dev route can't import from `functions/`, and `functions/`
// can't pull a transitive dependency on react-native via lib/firebase.

import * as admin from 'firebase-admin';

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

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  // admin.firestore.Timestamp has a toDate() method.
  if (typeof v === 'object' && v !== null && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    try {
      return (v as { toDate: () => Date }).toDate();
    } catch {
      return null;
    }
  }
  return null;
}

function coerceTrend(id: string, raw: Record<string, unknown>): ServerTrendingDoc | null {
  const label = typeof raw.label === 'string' ? raw.label : null;
  const promptTemplate = typeof raw.promptTemplate === 'string' ? raw.promptTemplate : null;
  if (!label || !promptTemplate) return null;
  return {
    id,
    label,
    emoji: typeof raw.emoji === 'string' ? raw.emoji : '✨',
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    promptTemplate,
    gradientColors: Array.isArray(raw.gradientColors)
      ? (raw.gradientColors.filter((c): c is string => typeof c === 'string') as string[])
      : ['#7c3aed', '#ec4899'],
    isPremium: raw.isPremium === true,
    sensitiveCategory: raw.sensitiveCategory === true,
    active: raw.active === true,
    sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : 0,
    startDate: toDate(raw.startDate),
    endDate: toDate(raw.endDate),
  };
}

export function isServerTrendLive(t: ServerTrendingDoc, now: Date = new Date()): boolean {
  if (!t.active) return false;
  if (t.startDate && t.startDate > now) return false;
  if (t.endDate && t.endDate < now) return false;
  return true;
}

/**
 * Fetch a trend doc by id. Throws TrendNotFoundError on missing-doc,
 * TrendNotLiveError when active==false or out-of-window. Admin SDK
 * bypasses firestore.rules, so this works regardless of the read rule
 * configured for the collection.
 *
 * Validates the trendId shape (collection-doc id chars only) so a
 * malicious client can't path-traverse into a different collection.
 */
export async function fetchServerTrend(trendId: string): Promise<ServerTrendingDoc> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(trendId)) {
    throw new TrendNotFoundError(trendId);
  }
  const snap = await admin.firestore().collection('trending').doc(trendId).get();
  if (!snap.exists) throw new TrendNotFoundError(trendId);
  const trend = coerceTrend(snap.id, snap.data() ?? {});
  if (!trend) throw new TrendNotFoundError(trendId);
  if (!isServerTrendLive(trend)) throw new TrendNotLiveError(trendId);
  return trend;
}

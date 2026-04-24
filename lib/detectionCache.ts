import type { DetectedPerson } from '@/lib/detect';

// In-memory cache of people-detection results, keyed by a hash of the
// source image's base64 bytes. The common case this exists for: a user
// re-picks the *same* photo from their library to try a different
// category. Without a cache we'd burn a Flash detection call every time
// and flash the "Detecting people…" spinner over a result we just had.
//
// Not persisted. A fresh app launch re-detects. That's intentional —
// AsyncStorage serialization of base64 hashes + arrays isn't worth the
// complexity for a ~1-second Gemini call we only avoid within a session.

const MAX_ENTRIES = 10;

// LRU via insertion order on a Map: on hit we delete+reinsert to move
// the entry to the "most recent" end; on overflow we drop the first
// (least recent) key. Map preserves insertion order per spec, so this
// is O(1) per op and doesn't need a side list.
const cache = new Map<string, DetectedPerson[]>();

/**
 * FNV-1a 32-bit over the raw base64 string. Not cryptographic; we just
 * need a fast, deterministic fingerprint that's collision-resistant
 * enough for a handful of in-session photos. Runs at hundreds of MB/s
 * in V8/Hermes — even a 16MB base64 string is well under 100ms.
 *
 * We return hex so the key is a stable short string (not a number that
 * could get stringified differently somewhere).
 */
export function hashBase64(base64: string): string {
  let h = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < base64.length; i++) {
    h ^= base64.charCodeAt(i);
    // 32-bit FNV prime multiplication via shifts (faster than Math.imul
    // on some runtimes and avoids any 53-bit precision drift).
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

export function getCachedDetection(hash: string): DetectedPerson[] | null {
  const hit = cache.get(hash);
  if (!hit) return null;
  // Re-insert to refresh LRU recency.
  cache.delete(hash);
  cache.set(hash, hit);
  // Return a shallow copy so callers can't mutate the cached array.
  return hit.slice();
}

export function cacheDetection(hash: string, people: DetectedPerson[]): void {
  // Overwrite-in-place semantics: if the same key exists, delete first
  // so the re-insert puts it at the most-recent end.
  if (cache.has(hash)) cache.delete(hash);
  cache.set(hash, people.slice());
  // Evict oldest until under cap. `keys().next().value` is the first-
  // inserted key, i.e. the least-recently used.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// Test/diagnostic hook. Not called by app code.
export function _clearDetectionCacheForTests(): void {
  cache.clear();
}

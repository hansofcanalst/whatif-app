// AsyncStorage-backed gallery for dev + offline.
//
// Why this exists:
// The production flow writes each generation to Firestore (via the Cloud
// Function) and Cloud Storage (for image URLs). The dev flow uses the
// Expo local API route at `app/api/generate+api.ts`, which deliberately
// SKIPS both — it returns data URIs inline and never touches Firestore.
// That made the Gallery tab permanently empty in dev because it only
// reads from Firestore via `listGenerations`.
//
// This module closes the gap by persisting a rolling window of the most
// recent generations to AsyncStorage, keyed by generationId. The
// Gallery screen merges this local list with Firestore results so the
// UI stays consistent regardless of which backend produced a given
// generation.
//
// Size note: each entry carries the original photo + up to 6 result
// images as base64 data URIs. A single entry can easily be 1-3 MB.
// We cap the stored list at MAX_ENTRIES (30) and trim oldest-first.
// AsyncStorage's per-key limit on Android (legacy) is ~6 MB, but the
// modern "next-storage" backend and iOS/web have much higher headroom;
// 30 entries at ~2 MB average lands well within practical bounds on
// every platform we target. If we ever outgrow that, the right move is
// to offload images to the filesystem and keep only paths in storage.

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GenerationDoc, GenerationResult } from './firestore';

// Bump this key when the stored shape changes in a backwards-incompatible
// way so we don't crash reading old rows.
const STORAGE_KEY = 'whatif:localGallery:v1';
const MAX_ENTRIES = 30;

// Firestore's Timestamp type is painful to mock faithfully and the gallery
// UI doesn't actually read it (it only relies on ordering). We store a
// millisecond epoch on a separate field and leave GenerationDoc.createdAt
// as null — `listLocalGallery` returns them pre-sorted so downstream
// consumers don't need to care.
export interface LocalGenerationDoc extends GenerationDoc {
  _localCreatedAt: number;
}

function isLocalGenerationDoc(value: unknown): value is LocalGenerationDoc {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.categoryId === 'string' &&
    Array.isArray(v.results) &&
    typeof v._localCreatedAt === 'number'
  );
}

/**
 * Read the whole local gallery, newest first. Returns [] on any failure —
 * we'd rather show an empty gallery than crash the screen.
 */
export async function listLocalGallery(): Promise<LocalGenerationDoc[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: filter out anything that doesn't match the current shape
    // (e.g. partial writes from a killed app, rows from a previous schema).
    const valid = parsed.filter(isLocalGenerationDoc);
    // Stored newest-first already, but re-sort defensively so UI ordering
    // is correct even if a writer wrote in the wrong order.
    valid.sort((a, b) => b._localCreatedAt - a._localCreatedAt);
    return valid;
  } catch (e) {
    console.warn('[localGallery] list failed', e);
    return [];
  }
}

/**
 * Look up a single local entry by id. Used by the result screen as a
 * fallback when the Firestore lookup returns null (dev-only generations
 * don't exist in Firestore).
 */
export async function getLocalGeneration(
  id: string,
): Promise<LocalGenerationDoc | null> {
  const all = await listLocalGallery();
  return all.find((d) => d.id === id) ?? null;
}

export interface AppendLocalGenerationArgs {
  generationId: string;
  userId: string | null;
  categoryId: string;
  categoryLabel: string;
  // The photo the transformation ran against, already turned into an
  // inline data URI so the stored doc is self-contained and still
  // renders after an app reload when the original file URI is long gone.
  originalImageURL: string;
  results: GenerationResult[];
}

/**
 * Prepend a new generation to the local gallery and persist.
 *
 * Returns the trimmed list so the caller can update any in-memory copy
 * (e.g. a Zustand slice) in one shot without re-reading storage.
 */
export async function appendLocalGeneration(
  args: AppendLocalGenerationArgs,
): Promise<LocalGenerationDoc[]> {
  const entry: LocalGenerationDoc = {
    id: args.generationId,
    userId: args.userId ?? 'local',
    categoryId: args.categoryId,
    categoryLabel: args.categoryLabel,
    originalImageURL: args.originalImageURL,
    results: args.results,
    status: 'complete',
    // Firestore Timestamp shape; null is valid per the GenerationDoc type.
    createdAt: null,
    _localCreatedAt: Date.now(),
  };

  const existing = await listLocalGallery();
  // Dedupe by id so re-generations don't accumulate duplicates (rare, but
  // possible if the user retries a generation that the server successfully
  // recorded before the client saw the response).
  const withoutDupe = existing.filter((d) => d.id !== entry.id);
  const next = [entry, ...withoutDupe].slice(0, MAX_ENTRIES);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    // Typical cause here is AsyncStorage hitting its per-key size ceiling
    // on Android. Halve the list and try again so at least SOME history
    // survives instead of dropping the newest entry silently.
    console.warn('[localGallery] append failed, retrying with smaller list', e);
    const smaller = next.slice(0, Math.max(1, Math.floor(MAX_ENTRIES / 2)));
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(smaller));
      return smaller;
    } catch (e2) {
      console.warn('[localGallery] retry also failed — giving up', e2);
      return existing;
    }
  }
  return next;
}

/**
 * Clear the local gallery. Currently unused by the UI but handy for a
 * future "clear history" debug action or a sign-out flow.
 */
export async function clearLocalGallery(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[localGallery] clear failed', e);
  }
}

/**
 * Remove a single entry by id and persist. Used by the gallery's
 * long-press → delete flow. No-op if the id isn't in the list.
 *
 * Returns the new list (post-removal) so callers can update any
 * in-memory copy without re-reading storage. Mirrors the
 * `appendLocalGeneration` pattern.
 */
export async function removeLocalGeneration(id: string): Promise<LocalGenerationDoc[]> {
  const existing = await listLocalGallery();
  const next = existing.filter((d) => d.id !== id);
  if (next.length === existing.length) return existing; // not present
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[localGallery] remove failed', e);
    return existing;
  }
  return next;
}

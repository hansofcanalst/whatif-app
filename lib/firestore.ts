import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  increment,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from './firebase';

export interface UserDoc {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  freeGenerationsUsed: number;
  // Server-only allow-list flag. When true the free-generation lifetime
  // cap is lifted for this one account (the App Store reviewer demo login)
  // on BOTH client (`canGenerate` in hooks/useGeneration.ts) and server
  // (`checkQuotaAndCategory` in functions/src/generate.ts). Absent/false
  // for every normal user; locked server-side in firestore.rules so a
  // client can't self-exempt. Quota only — does not touch premium gating
  // or any safety gate.
  quotaExempt?: boolean;
  subscriptionStatus: 'free' | 'pro';
  subscriptionExpiry: Timestamp | null;
  revenueCatId: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface GenerationResult {
  imageURL: string;
  // Pre-resized 256px thumbnail URL. Optional — older entries written
  // before this field existed have just `imageURL`, and the gallery
  // falls back to imageURL when thumbURL is missing. Using the
  // thumbnail in the gallery cuts bytes-on-the-wire ~95% vs. the
  // full result, which matters at scale (dozens of users × dozens of
  // entries × multiple results each adds up fast).
  thumbURL?: string;
  prompt: string;
  label: string;
}

export interface GenerationDoc {
  id: string;
  userId: string;
  categoryId: string;
  categoryLabel: string;
  originalImageURL: string;
  /** Pre-resized 256px thumbnail of the original. See GenerationResult.thumbURL. */
  originalThumbURL?: string;
  results: GenerationResult[];
  status: 'pending' | 'processing' | 'complete' | 'failed';
  createdAt: Timestamp | null;
}

export async function ensureUserDoc(user: User): Promise<UserDoc> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  // Canonical base shape + defaults for a fresh user. Used both to CREATE
  // the doc on first sign-in and to BACKFILL any individual field that's
  // missing if the doc already exists (the reconcile branch below).
  const base: Partial<UserDoc> = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    freeGenerationsUsed: 0,
    subscriptionStatus: 'free',
    subscriptionExpiry: null,
    revenueCatId: null,
  };

  let wrote = false;

  if (!snap.exists()) {
    await setDoc(ref, { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    wrote = true;
  } else {
    // Reconcile an existing-but-partial doc. Another writer can create
    // users/{uid} via a merge write BEFORE this runs — historically the
    // push-token registration (now hardened to updateDoc), and the
    // RevenueCat webhook. That leaves the base fields absent; a missing
    // `freeGenerationsUsed` renders "NaN/3 FREE" and makes canGenerate()
    // block the user forever, because the client can't otherwise add the
    // field (firestore.rules treats it as server-controlled). Backfill
    // any missing base field with its default. Idempotent: fields already
    // present are left untouched, so this is a no-op on a healthy doc.
    //
    // Best-effort: backfilling `freeGenerationsUsed` / `subscriptionStatus`
    // needs the initialization carve-out in firestore.rules (absent -> 0 /
    // 'free'). If those rules aren't deployed yet the write is denied; we
    // swallow it — the `?? 0` reads keep the UI sane and the generate
    // Cloud Function backfills `freeGenerationsUsed` server-side on the
    // first successful generation regardless.
    const data = snap.data();
    const backfill: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(base)) {
      if (!(key in data)) backfill[key] = value;
    }
    if (Object.keys(backfill).length > 0) {
      backfill.updatedAt = serverTimestamp();
      try {
        await setDoc(ref, backfill, { merge: true });
        wrote = true;
      } catch (e) {
        console.warn('[firestore] ensureUserDoc backfill failed (continuing)', e);
      }
    }
  }

  // Re-read only when we actually wrote. On a healthy existing doc the
  // snapshot we already hold is authoritative (its timestamps are already
  // resolved), so we skip a redundant round-trip on the hot auth path.
  if (wrote) {
    const fresh = await getDoc(ref);
    return fresh.data() as UserDoc;
  }
  return snap.data() as UserDoc;
}

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

/**
 * Live subscription to users/{uid}. Replaces the one-shot read on the auth
 * path so freeGenerationsUsed (and the rest of the doc) update in real time
 * — the generation counter used to be frozen at its sign-in value until the
 * app was restarted, because the doc was read exactly once.
 *
 * Returns the Firestore unsubscribe fn; the caller MUST call it on sign-out
 * and unmount to avoid a listener leak. `onData` fires with the current doc
 * on attach and on every subsequent change. A snapshot for a non-existent
 * doc is skipped — the caller guarantees existence via `ensureUserDoc`
 * before subscribing — so `onData` always receives a fully-shaped UserDoc.
 */
export function subscribeToUserDoc(
  uid: string,
  onData: (doc: UserDoc) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) onData(snap.data() as UserDoc);
    },
    onError,
  );
}

export async function incrementFreeGenerations(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    freeGenerationsUsed: increment(1),
    updatedAt: serverTimestamp(),
  });
}

export async function listGenerations(uid: string): Promise<GenerationDoc[]> {
  const q = query(
    collection(db, 'generations'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GenerationDoc, 'id'>) }));
}

export async function getGeneration(id: string): Promise<GenerationDoc | null> {
  const snap = await getDoc(doc(db, 'generations', id));
  return snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<GenerationDoc, 'id'>) }) : null;
}

/**
 * Delete a generation doc by id. Security rules enforce owner-only:
 * trying to delete someone else's doc throws permission-denied.
 *
 * Storage objects (original + result images at users/{uid}/generations/{id}/*.jpg)
 * are NOT cleaned up here. Doing so client-side would require listing
 * the bucket prefix or remembering each result's storage path on the
 * doc — both fragile compared to a server-side Firestore-trigger
 * Cloud Function that watches `onDelete` and sweeps the prefix. That
 * function is a follow-up; for now the orphaned bytes are acceptable
 * because the visible gallery is the user's mental model and Storage
 * cost at current scale is negligible.
 */
export async function deleteGeneration(id: string): Promise<void> {
  await deleteDoc(doc(db, 'generations', id));
}

/**
 * Delete every generation owned by `uid`. Used by the account-deletion
 * flow. Reads the full list first (Firestore has no native "delete
 * where" client API) then issues parallel deletes. Errors on individual
 * docs are logged but don't block the rest — partial deletion is
 * better than no deletion if one row is in a weird state.
 *
 * Like `deleteGeneration`, this does NOT clean up Storage objects.
 * A Cloud Function `onUserDelete` trigger is the right place for that.
 */
export async function deleteAllUserGenerations(uid: string): Promise<void> {
  const docs = await listGenerations(uid);
  const results = await Promise.allSettled(docs.map((d) => deleteGeneration(d.id)));
  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(
      `[firestore] deleteAllUserGenerations: ${failures.length}/${docs.length} deletions failed`,
      failures,
    );
  }
}

/**
 * Delete the user doc itself. Rules allow owner-delete; called as part
 * of the account-deletion flow AFTER deleting the user's generations.
 * Doing it before would invalidate the auth context that
 * `deleteAllUserGenerations` relies on.
 */
export async function deleteUserDoc(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid));
}

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
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from './firebase';

export interface UserDoc {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  freeGenerationsUsed: number;
  subscriptionStatus: 'free' | 'pro';
  subscriptionExpiry: Timestamp | null;
  revenueCatId: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface GenerationResult {
  imageURL: string;
  prompt: string;
  label: string;
}

export interface GenerationDoc {
  id: string;
  userId: string;
  categoryId: string;
  categoryLabel: string;
  originalImageURL: string;
  results: GenerationResult[];
  status: 'pending' | 'processing' | 'complete' | 'failed';
  createdAt: Timestamp | null;
}

export async function ensureUserDoc(user: User): Promise<UserDoc> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
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
    await setDoc(ref, { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  const fresh = await getDoc(ref);
  return fresh.data() as UserDoc;
}

export async function getUserDoc(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
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

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
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

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  User,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { auth } from './firebase';
import { ensureUserDoc } from './firestore';

export type AuthUser = User;

export async function signUpWithEmail(email: string, password: string, displayName?: string): Promise<AuthUser> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(cred.user, { displayName });
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signInWithEmail(email: string, password: string): Promise<AuthUser> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signInWithGoogleIdToken(idToken: string): Promise<AuthUser> {
  const credential = GoogleAuthProvider.credential(idToken);
  const cred = await signInWithCredential(auth, credential);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signInWithAppleIdToken(idToken: string, nonce?: string): Promise<AuthUser> {
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken, rawNonce: nonce });
  const cred = await signInWithCredential(auth, credential);
  await ensureUserDoc(cred.user);
  return cred.user;
}

export async function signOut(): Promise<void> {
  await fbSignOut(auth);
}

export function subscribeToAuth(callback: (user: AuthUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

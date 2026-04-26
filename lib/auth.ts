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
import { ensureUserDoc, deleteAllUserGenerations, deleteUserDoc } from './firestore';
import { clearLocalGallery } from './localGallery';

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

/**
 * Specific error class so callers can branch on "needs reauth" without
 * relying on Firebase's error-code string. The Firebase SDK throws an
 * Error with `code: 'auth/requires-recent-login'` when a sensitive
 * operation (delete, change password, change email) is attempted on a
 * stale session. The user has to log out and back in, then retry.
 */
export class ReauthRequiredError extends Error {
  constructor() {
    super('Please log out and log back in, then try deleting your account again.');
    this.name = 'ReauthRequiredError';
  }
}

/**
 * Delete the user's account and all associated data.
 *
 * Order matters: the auth user must be deleted LAST because once it's
 * gone, every subsequent Firestore operation fails permission checks
 * (rules require `request.auth.uid`). So we delete the data first, then
 * the auth principal.
 *
 * What gets deleted:
 *   - Every `generations/{id}` doc owned by the user (rules allow
 *     owner-delete; Storage objects are orphaned — a future Cloud
 *     Function sweep on user-delete is the right cleanup mechanism).
 *   - The `users/{uid}` doc (PII: email, displayName, photoURL).
 *   - The local AsyncStorage gallery (any cached results).
 *   - The Firebase Auth account itself.
 *
 * What's intentionally LEFT in place:
 *   - `moderation_log/*` and `logs/*` entries that reference the uid.
 *     Once `users/{uid}` is gone the uid is an opaque string with no
 *     PII linkage — defensible as anonymized. Strictly compliant
 *     erasure would require server-side cleanup via a Cloud Function;
 *     deferred until that becomes a real audit need.
 *
 * Throws `ReauthRequiredError` if Firebase rejects the auth-user
 * delete with `auth/requires-recent-login`. At that point the data
 * deletes have already happened — calling deleteAccount again after
 * reauth is safe (the firestore deletes are idempotent and the auth
 * delete will succeed second time).
 */
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const uid = user.uid;

  // 1. Generations (and the original/result images they reference in
  //    Firestore — Storage cleanup is a separate concern).
  await deleteAllUserGenerations(uid);

  // 2. User doc — the canonical PII record. After this point, the
  //    uid no longer points to anything personally identifying.
  try {
    await deleteUserDoc(uid);
  } catch (e) {
    console.warn('[auth] deleteUserDoc failed (continuing):', e);
  }

  // 3. Local AsyncStorage. Doesn't cross sessions, but a paranoid
  //    user re-installing the app shouldn't see ghost results.
  try {
    await clearLocalGallery();
  } catch (e) {
    console.warn('[auth] clearLocalGallery failed (continuing):', e);
  }

  // 4. Firebase Auth — last, because dropping it invalidates the
  //    Firestore rules context above.
  try {
    await user.delete();
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/requires-recent-login') {
      throw new ReauthRequiredError();
    }
    throw e;
  }
}

export function subscribeToAuth(callback: (user: AuthUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}

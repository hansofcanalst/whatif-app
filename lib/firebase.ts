import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  // @ts-ignore — getReactNativePersistence is runtime-exported on RN bundle; types missing in firebase@10
  getReactNativePersistence,
  getAuth,
  Auth,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { config } from '@/constants/config';

// --- App ---
const existing = getApps();
const app: FirebaseApp = existing.length > 0 ? existing[0]! : initializeApp(config.firebase);

// --- Auth ---
// On the first import we must use `initializeAuth` so the auth component
// registers with the FirebaseApp. On subsequent imports (Fast Refresh reusing
// the module), `initializeAuth` throws `auth/already-initialized`, and we
// must call `getAuth` instead.
function bootstrapAuth(): Auth {
  if (Platform.OS === 'web') {
    return getAuth(app);
  }

  if (typeof getReactNativePersistence !== 'function') {
    // If this fires, Metro resolved the browser bundle of firebase/auth.
    // Check metro.config.js has `unstable_enablePackageExports = true` and
    // `unstable_conditionNames` includes 'react-native'. Then restart with `-c`.
    throw new Error(
      '[firebase] getReactNativePersistence is undefined — Metro bundled the ' +
        'browser build of firebase/auth. Check metro.config.js and restart with `npx expo start -c`.',
    );
  }

  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e: any) {
    if (e?.code === 'auth/already-initialized') {
      return getAuth(app);
    }
    throw e;
  }
}

export const auth: Auth = bootstrapAuth();
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export { app };

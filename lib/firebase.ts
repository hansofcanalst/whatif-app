import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { config } from '@/constants/config';

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(config.firebase);
} else {
  app = getApps()[0]!;
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
export { app };

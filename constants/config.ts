import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

function env(publicKey: string, fallbackKey: string): string {
  // EXPO_PUBLIC_* vars are inlined into process.env at build time in SDK 50+.
  // `extra` is a legacy fallback for values pushed through app.json.
  return process.env[publicKey] ?? extra[fallbackKey] ?? '';
}

export const config = {
  firebase: {
    apiKey: env('EXPO_PUBLIC_FIREBASE_API_KEY', 'FIREBASE_API_KEY'),
    authDomain: env('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN', 'FIREBASE_AUTH_DOMAIN'),
    projectId: env('EXPO_PUBLIC_FIREBASE_PROJECT_ID', 'FIREBASE_PROJECT_ID'),
    storageBucket: env('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET', 'FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', 'FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('EXPO_PUBLIC_FIREBASE_APP_ID', 'FIREBASE_APP_ID'),
  },
  revenueCat: {
    iosKey: env('EXPO_PUBLIC_REVENUECAT_API_KEY_IOS', 'REVENUECAT_API_KEY_IOS'),
    androidKey: env('EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID', 'REVENUECAT_API_KEY_ANDROID'),
  },
  cloudFunctions: {
    baseURL: env('EXPO_PUBLIC_CLOUD_FUNCTIONS_URL', 'CLOUD_FUNCTIONS_URL'),
  },
  freeGenerationCap: 3,
  maxImageSize: 1024,
  imageQuality: 0.8,
};

export function assertFirebaseConfigured(): void {
  const missing = Object.entries(config.firebase)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    const msg =
      `Firebase is not configured. Missing: ${missing.join(', ')}.\n` +
      `Add EXPO_PUBLIC_FIREBASE_* vars to .env and restart the dev server ` +
      `(env vars are inlined at build time, so you must restart, not just reload).`;
    throw new Error(msg);
  }
}

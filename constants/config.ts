import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

function env(key: string): string {
  return process.env[key] ?? extra[key] ?? '';
}

export const config = {
  firebase: {
    apiKey: env('FIREBASE_API_KEY'),
    authDomain: env('FIREBASE_AUTH_DOMAIN'),
    projectId: env('FIREBASE_PROJECT_ID'),
    storageBucket: env('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: env('FIREBASE_MESSAGING_SENDER_ID'),
    appId: env('FIREBASE_APP_ID'),
  },
  revenueCat: {
    iosKey: env('REVENUECAT_API_KEY_IOS'),
    androidKey: env('REVENUECAT_API_KEY_ANDROID'),
  },
  cloudFunctions: {
    baseURL: env('CLOUD_FUNCTIONS_URL'),
  },
  freeGenerationCap: 3,
  maxImageSize: 1024,
  imageQuality: 0.8,
};

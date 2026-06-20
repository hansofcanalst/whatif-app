import AsyncStorage from '@react-native-async-storage/async-storage';

// One-time consent to send photos to the third-party Gemini AI.
//
// Durable source of truth is the user doc's `geminiConsentAt` (see
// lib/firestore.ts recordGeminiConsent) — that's cross-device and survives
// reinstall. THIS module is the local mirror: an AsyncStorage key plus an
// in-memory cache so the generation gate (hooks/useGeneration.ts) can read
// consent SYNCHRONOUSLY and so a returning user on the same device isn't
// re-prompted before the Firestore snapshot has loaded (or while offline).

const KEY = 'whatif:geminiConsent:v1';

// Synchronous mirror of the AsyncStorage flag. Hydrated once at hook mount
// via hydrateGeminiConsent(); flipped true immediately on grant so the
// re-invoked generation passes the gate in the same tick.
let cached = false;

export function hasLocalGeminiConsent(): boolean {
  return cached;
}

export async function hydrateGeminiConsent(): Promise<void> {
  try {
    cached = (await AsyncStorage.getItem(KEY)) === '1';
  } catch {
    // Best-effort: a read failure just means we might re-prompt. The
    // Firestore geminiConsentAt check suppresses the modal regardless.
  }
}

export async function persistLocalGeminiConsent(): Promise<void> {
  cached = true; // synchronous — the gate must pass on the immediate re-invoke
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // Best-effort; the Firestore write is the durable record.
  }
}

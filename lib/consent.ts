import AsyncStorage from '@react-native-async-storage/async-storage';

// One-time consent to send photos to the third-party Gemini AI.
//
// Durable source of truth is the user doc's `geminiConsentAt` (see
// lib/firestore.ts recordGeminiConsent) — that's cross-device and survives
// reinstall. THIS module is the local mirror so the generation gate
// (hooks/useGeneration.ts) can read consent SYNCHRONOUSLY and so a returning
// user on the same device isn't re-prompted before the Firestore snapshot has
// loaded (or while offline).
//
// CRITICAL: the mirror is keyed PER UID — both the AsyncStorage key
// (`whatif:geminiConsent:v1:<uid>`) and the in-memory cache (which records
// WHICH uid it holds). This makes cross-account leakage structurally
// impossible: a second account on the same device reads a different key and an
// in-memory cache stamped with another uid never matches. (Before Build 19 a
// single device-global key let account B inherit account A's consent and skip
// the disclosure — an App Store 5.1.2(i) blocker.)

const KEY_PREFIX = 'whatif:geminiConsent:v1:';
const keyFor = (uid: string) => `${KEY_PREFIX}${uid}`;

// Synchronous mirror of the AsyncStorage flag, scoped to the uid it was
// hydrated/granted for. `hasLocalGeminiConsent(uid)` only returns true when
// BOTH the flag is set AND it belongs to the uid being asked about — so a
// lingering in-memory cache from a previous account can never satisfy a new
// account's gate.
let cachedUid: string | null = null;
let cached = false;

export function hasLocalGeminiConsent(uid: string | null | undefined): boolean {
  return !!uid && cached && cachedUid === uid;
}

export async function hydrateGeminiConsent(uid: string | null | undefined): Promise<void> {
  if (!uid) {
    cached = false;
    cachedUid = null;
    return;
  }
  try {
    cached = (await AsyncStorage.getItem(keyFor(uid))) === '1';
  } catch {
    // Best-effort: a read failure just means we might re-prompt. The
    // Firestore geminiConsentAt check suppresses the modal regardless.
    cached = false;
  }
  cachedUid = uid;
}

export async function persistLocalGeminiConsent(uid: string | null | undefined): Promise<void> {
  if (!uid) return; // no account to attribute consent to
  cached = true; // synchronous — the gate must pass on the immediate re-invoke
  cachedUid = uid;
  try {
    await AsyncStorage.setItem(keyFor(uid), '1');
  } catch {
    // Best-effort; the Firestore write is the durable record.
  }
}

import React, { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { AIDisclosureModal } from '@/components/AIDisclosureModal';
import {
  grantGeminiConsent,
  hasLocalGeminiConsent,
  hydrateGeminiConsent,
} from '@/lib/consent';
import { signOut } from '@/lib/auth';

/**
 * First-run, unavoidable Gemini AI-disclosure gate.
 *
 * Apple rejected Builds 18 and 19 on 5.1.1/5.1.2: the "Before you start"
 * disclosure existed and was per-account correct (Build 19's per-uid keying),
 * but it only fired deep in the flow — pick category → pick photo → Generate →
 * onNeedsConsent — so a reviewer who just signed in and looked around never saw
 * it. This gate moves the SAME disclosure (same AIDisclosureModal, same per-uid
 * storage in lib/consent.ts + userDoc.geminiConsentAt) to the authenticated
 * entry point: it wraps the tab navigator, so it is the first thing a
 * signed-in-but-unconsented account meets, before home renders anything
 * actionable. (tabs) is the right chokepoint because every generation surface
 * (generate/*) is only reachable from home inside (tabs). The send-gate in
 * useGeneration.start() stays as a backstop so a photo can never be sent
 * unconsented even via an unexpected path.
 *
 * Timing. `user` is guaranteed once we're inside (tabs) — AuthGate redirects
 * signed-out users to login — but `userDoc` loads ASYNCHRONOUSLY after auth
 * resolves (useAuth flips loading=false off the auth callback, then awaits
 * ensureUserDoc). So we must not guess: the modal shows ONLY once consent is
 * provably missing, and we never block render so an already-consented user can
 * never get stuck behind it.
 */
export function ConsentGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const userDoc = useAuthStore((s) => s.userDoc);
  const uid = user?.uid;

  // `hydrated`: the per-uid local mirror has been read from AsyncStorage —
  // tracked as React state so the gate re-renders once the on-device answer is
  // known. `granted`: the user just tapped Agree — flips the modal off
  // synchronously even if the Firestore write is slow or offline, instead of
  // waiting for the userDoc snapshot to round-trip. BOTH reset on uid change so
  // a second account never inherits the first account's gate state.
  const [hydrated, setHydrated] = useState(false);
  const [granted, setGranted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    setGranted(false);
    hydrateGeminiConsent(uid).finally(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Consent is satisfied by ANY of: this-session Agree, the durable Firestore
  // stamp, or the per-uid local mirror (only trusted once it has been read).
  const consented =
    granted || !!userDoc?.geminiConsentAt || (hydrated && hasLocalGeminiConsent(uid));

  // Prompt ONLY when we KNOW consent is missing: a signed-in account whose
  // mirror has been read AND whose user doc has loaded without a stamp. While
  // either source is still pending we render the app and stay silent — no false
  // prompt during the load window, and never a dead-end for a consented user.
  const needsConsent = !!uid && hydrated && !!userDoc && !consented;

  const handleAgree = async () => {
    setGranted(true); // synchronous hide; independent of the Firestore round-trip
    await grantGeminiConsent(uid); // single shared grant path (see lib/consent.ts)
  };

  const handleDecline = () => {
    // The disclosure is a precondition for the app's only function, so a
    // decline returns the user to a clean signed-out state rather than a
    // half-usable session. Re-login re-shows the gate (consent unrecorded).
    signOut().catch((e) => console.warn('[ConsentGate] signOut failed', e));
  };

  return (
    <>
      {children}
      <AIDisclosureModal visible={needsConsent} onAgree={handleAgree} onDecline={handleDecline} />
    </>
  );
}

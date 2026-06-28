import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { AIDisclosureModal } from '@/components/AIDisclosureModal';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';
import {
  grantGeminiConsent,
  hasLocalGeminiConsent,
  hydrateGeminiConsent,
} from '@/lib/consent';
import { signOut } from '@/lib/auth';

/**
 * First-run modal coordinator + Gemini AI-disclosure gate.
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
 *
 * Build 21 — single first-run modal coordinator (fixes the Build 20 freeze,
 * Apple 2.1(a) on iPad). The onboarding tutorial is ALSO a React Native
 * <Modal>, and it used to render up in app/_layout's AuthGate. On a fresh
 * install + unconsented account — exactly an App Store reviewer's state — the
 * tutorial modal (gated on a fast AsyncStorage read) and this consent modal
 * (gated on the slower Firestore userDoc load) both auto-presented within ~1s
 * of each other. iOS allows only one presented view controller at a time, so
 * the second present() was rejected by UIKit ("Attempt to present ... which is
 * already presenting") and first-run was left stuck with buttons unresponsive.
 * The tutorial now lives HERE and is mounted ONLY once consent is resolved AND
 * the consent modal is provably off-screen, so the two can never present at the
 * same time. Sequence on a fresh account: consent modal → Agree → (consent
 * modal fully dismissed) → tutorial. An already-consented user skips straight
 * to the tutorial; neither modal ever overlaps the other.
 */
export function ConsentGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const userDoc = useAuthStore((s) => s.userDoc);
  const uid = user?.uid;

  // `hydrated`: the per-uid local mirror has been read from AsyncStorage —
  // tracked as React state so the gate re-renders once the on-device answer is
  // known. `granted`: the user just tapped Agree — flips the modal off
  // synchronously even if the Firestore write is slow or offline, instead of
  // waiting for the userDoc snapshot to round-trip. `consentClosed`: the
  // consent modal has FULLY dismissed (iOS Modal.onDismiss) — this is what lets
  // the tutorial present without racing a still-dismissing consent modal. ALL
  // reset on uid change so a second account never inherits the first account's
  // gate state.
  const [hydrated, setHydrated] = useState(false);
  const [granted, setGranted] = useState(false);
  const [consentClosed, setConsentClosed] = useState(false);
  // Whether the consent modal was ever required this session. If it was never
  // needed (an already-consented user), there is nothing to dismiss and the
  // tutorial may present immediately.
  const consentWasNeeded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    setGranted(false);
    setConsentClosed(false);
    consentWasNeeded.current = false;
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

  // Remember the consent modal was required, so we know to wait for its
  // dismissal before letting the tutorial present.
  useEffect(() => {
    if (needsConsent) consentWasNeeded.current = true;
  }, [needsConsent]);

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

  // The onboarding tutorial is itself a <Modal>, so it may mount ONLY when
  // consent is resolved AND the consent modal cannot be on screen — either it
  // was never needed, or it has fully dismissed (consentClosed). On non-iOS
  // there is no single-presentation constraint and Modal.onDismiss does not
  // fire, so we don't wait on it. If onDismiss somehow never fires the tutorial
  // is simply skipped — a benign degradation, never a freeze.
  const consentClear =
    Platform.OS !== 'ios' || !consentWasNeeded.current || consentClosed;
  const showTutorial = !!uid && consented && consentClear;

  return (
    <>
      {children}
      <AIDisclosureModal
        visible={needsConsent}
        onAgree={handleAgree}
        onDecline={handleDecline}
        onDismiss={() => setConsentClosed(true)}
      />
      {showTutorial ? <OnboardingTutorial signedIn /> : null}
    </>
  );
}

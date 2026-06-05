# Progress log

Newest entries at the top. Each entry is a self-contained summary of
one task/change set — written so it can be pasted as-is for review.

---

## 2026-06-05 — Build 15: fix Rules-of-Hooks crash opening a gallery photo

**One client change. No server, minor-gate, quota, or watermark-logic
changes (watermark stays always-on).**

**Crash:** opening a result from the Gallery threw React's "Rendered more
hooks than during the previous render." — a launch blocker.

**Root cause** (`app/result/[id].tsx`): the `setIdx` `useCallback` sat
*below* the `if (!current || !original)` early-return guard. On the
gallery-open path the first render hits the guard (5 hooks, spinner), then
the `useEffect` loads the doc via `getGeneration`/`getLocalGeneration`,
`setDoc` flips the guard false, and the second render falls through to the
6th hook → count mismatch → crash. The fresh-generation hot path never
tripped it because `current`/`original` exist on the first render, so the
guard never fired.

It was **not** `FilteredResultPanel` — its four hooks are unconditional and
top-of-component; the Build-14 `const watermark = true` (which removed a
`useState`) keeps that component's per-render hook count stable and can't
cause a mismatch. Red herring.

**Fix:** moved the `setIdx` `useCallback` above the early return (it only
closes over `router`). Re-audited the whole component: all six hooks
(`useLocalSearchParams`, `useRouter`, `useGenerationStore`, `useState`,
`useEffect`, `useCallback`) now sit above any conditional return; zero hooks
below the guard. `useGenerationStore.getState()` on the `original`/
`categoryId` lines is the static store accessor, not a hook. App +
functions typecheck clean.

**Build 15 cut.** Committed `app.json` buildNumber 13→14 (EAS production
`autoIncrement` stamps 15 at build time). `eas build --profile production
--platform ios`.



**Two client changes. No server, minor-gate, quota, or watermark-logic
changes (watermark stays always-on).**

**1. Save to Photos.** The result view's Save button previously wrote the
image to the app's document directory (`FsFile(Paths.document, …)`) and
popped an "Saved" Alert — so nothing actually landed in the user's Photos.
Rewired the native `handleSave` branch (`components/FilteredResultPanel.tsx`)
to save into the iOS Photos library via `expo-media-library`:
- Uses the SAME `resolveExportUri()` captureRef output that Share uses, so
  the watermark + active filter are baked into the saved bytes. Watermark is
  always on → `needsCapture` is always true → `uri` is never the raw
  imageURL, so Save can never write an un-watermarked image.
- Requests ADD-only permission (`requestPermissionsAsync(true)` → maps to
  `NSPhotoLibraryAddUsageDescription`), then `saveToLibraryAsync(uri)`.
- Success → toast "Saved to Photos"; permission-denied → toast "Allow Photos
  access in Settings to save". The old Alert path is gone.
- New native dep: `expo-media-library@~18.2.1` (autolinks; no config plugin
  needed since the only iOS build-config requirement is the Info.plist add
  string). Added `NSPhotoLibraryAddUsageDescription` to `app.json`
  ios.infoPlist. **Needs a new build** (native module).

**2. Gallery top-bar un-clip** (`app/(tabs)/gallery.tsx`). The top bar
(Results/Compare toggle + count badge + Select pill, and the selection action
bar) overflowed horizontally on normal phone widths, clipping the Select pill
off the right edge. Smallest fix, no redesign: `topBar` is now
`flexWrap:'wrap'` + `rowGap`, and `topBarRight` uses `marginLeft:'auto'`
(replacing `justifyContent:'space-between'`) so the right cluster wraps to its
own right-aligned line instead of clipping. Same controls; the existing
multi-select is now reachable. No iOS-Photos-style trash bar added.

**Build 14 cut.** Committed `app.json` buildNumber 12→13 (EAS production
`autoIncrement`, appVersionSource: local, stamps 14). `eas build --profile
production --platform ios`.

Typechecks clean (app + functions, both exit 0).

---

## 2026-06-04 — Build 13: gallery multi-select delete + watermark always-on

**Two changes bundled for Build 13. Client-only — no server, rules, minor-gate
or quota touched.**

**1. Gallery delete — single-photo fix + multi-select (delete only).**
Root cause of "delete doesn't work": the gallery renders `localGallery ∪
remoteDocs`, but `remoteDocs` is component state (from `listGenerations`) that
the delete path never pruned, so Firestore-backed tiles lingered until a
pull-to-refresh. The Firestore delete + Storage cascade (`onGenerationDeleted`
trigger) were already working.
- **Single fix** (`app/(tabs)/gallery.tsx`): after `removeGeneration(docId)`
  resolves, prune `remoteDocs` too → tile disappears immediately.
- **Multi-select** (`gallery.tsx`): `selectionMode` + `selectedIds:
  Set<docId>` (doc is the unit of deletion). A "Select" pill enters mode;
  the top bar becomes Cancel · "N selected" · Delete; tapping a tile toggles
  selection (checkmark + accent border) instead of navigating; long-press
  single-delete and the web X-badge are suppressed in selection mode.
- **Batch primitive** (`stores/generationStore.ts` `removeGenerations`):
  parallel `Promise.allSettled(deleteGeneration)` (each cascades Storage via
  the trigger) + ONE batched local prune; returns the ids whose Firestore
  delete genuinely succeeded so the gallery prunes `remoteDocs` for those. A
  failed delete stays in both caches → its tile remains; the rest complete.
- **Batch local prune** (`lib/localGallery.ts` `removeLocalGenerations`):
  single read-modify-write. Deliberately NOT
  `Promise.allSettled(ids.map(removeGeneration))` — concurrent per-id
  AsyncStorage read-modify-writes race and resurrect entries.
- **Batch share: deferred to v1.1** (needs a native share dep + a watermark
  decision). No batch/multi share control shipped.

**2. Watermark always-on for single-image share** (`components/
FilteredResultPanel.tsx`). Users could previously toggle the watermark OFF and
share/save an un-watermarked image, contradicting the App Store listing + the
app's safety posture. Removed the user-facing toggle entirely; `watermark` is
now a `const true`, so `needsCapture` is always true and every Save/Share goes
through the `captureRef` render with the watermark pill baked into the bytes.
Added a v1.1 HARD CONSTRAINT comment near `handleShare`: no future (batch)
share path may emit an un-watermarked image — it must use the same
captureRef-with-watermark render, never a raw stored imageURL/Storage object.

**Build 13 cut.** Committed `app.json` buildNumber 11→12 (EAS production
`autoIncrement`, appVersionSource: local, stamps 13). `eas build --profile
production --platform ios`.

Typechecks clean (app + functions, both exit 0).

---

## 2026-06-04 — Build 12: live generation counter + age-transform probe removed

**Three changes bundled for Build 12.**

**1. Removed the temporary age-transform diagnostic probe.** The
`io-bytes … identical=` `console.log` added to `generateOne`
(`functions/src/generate.ts`) during the age-transform echo-vs-weak-transform
investigation was reverted — the file is back to exactly its committed state
(diagnostic only, never committed). Re-deployed `functions:generate` so prod
runs the clean version. (Age-transform root-cause/fix still parked — see the
prior session notes; this only removed the probe.)

**2. Live generation counter (client read-mechanism swap).** The generation
counter was frozen at its sign-in value until app restart because the user
doc was read once via `ensureUserDoc` on the auth callback. Replaced the
one-shot read with a real-time `onSnapshot` listener:
- New `subscribeToUserDoc(uid, onData, onError)` helper in `lib/firestore.ts`
  (mirrors the `subscribeToAuth` pattern; returns the Firestore unsubscribe;
  skips non-existent-doc snapshots so `onData` always gets a full `UserDoc`).
- `hooks/useAuth.ts`: `ensureUserDoc` still runs FIRST (keeps the
  create-on-first-signin + NaN/3 backfill fixes and guarantees the listener
  observes a fully-shaped doc), then attaches the live listener.
- Leak/race handling: `userDocUnsubRef` + `teardownUserDoc()` tear the
  listener down on every auth change, sign-out, and unmount (no listener
  while logged out, none left pointing at a prior account). An `authEpochRef`
  bumped per auth callback makes a late-resolving `ensureUserDoc().then()`
  from a superseded auth state bail without attaching a stale listener.
- Preserved exactly: `setLoading(false)` off the auth callback, the
  `ensureUserDoc().catch` error+toast path, and the `UserDoc` shape/typing.
  Pure read-mechanism change — `quotaExempt`, server cap, premium gating, and
  the minor-gate are untouched.

**3. Build 12 cut.** Committed `app.json` buildNumber 10→11; EAS production
`autoIncrement` (appVersionSource: local) stamps 12 at build time and writes
it back to the working-tree `app.json`. `eas build --profile production
--platform ios`.

Typechecks clean (app + functions, both exit 0).

---

## 2026-06-04 — Stop `freeGenerationsUsed` climbing past cap for `quotaExempt`

**Context:** The reviewer demo account's counter was showing 4/3, 5/3 — the
`quotaExempt` flag lifts the cap (so generation isn't blocked) but the
success-path counter was still incrementing on every generation, so the
displayed `freeGenerationsUsed` kept climbing past 3.

**Fix:** `functions/src/generate.ts` — the success-path increment (around
line 655) previously bumped `freeGenerationsUsed` for any non-pro user. Added
`&& !user.quotaExempt` so exempt reviewers don't increment either, mirroring
the cap exemption in `checkQuotaAndCategory`. Read the existing `quotaExempt`
field off the already-fetched user doc; no extra read.

**Scope / safety:** Quota counter only. Non-exempt users increment exactly as
before. Premium gate, per-minute rate limiter, and the minor-detection gate /
`moderation_log` are all untouched — `freeGenerationsUsed` is the quota
counter, not the safety audit log.

**Deploy:** `npx tsc --noEmit` clean → `firebase deploy --only functions`
(all 6 functions updated successfully). No app rebuild — server-only change.

---

## 2026-06-03 — App Store reviewer quota exemption (`quotaExempt` flag)

**Context:** Apple's reviewer needs to fully test generation, but the free
tier hard-caps lifetime generations at 3. Goal: exempt ONE account (the
reviewer demo login) from the cap without weakening it for anyone else.
Quota only — the minor-gate / safety path is untouched.

**Discovery — the cap lives in two independent enforcement points + two
cosmetic displays:**
- **Server:** `functions/src/generate.ts` `checkQuotaAndCategory` — hardcoded
  `FREE_CAP = 3` vs per-user `freeGenerationsUsed`; throws 402. Pro
  (`subscriptionStatus === 'pro'`) already bypasses.
- **Client GATE:** `hooks/useGeneration.ts` `canGenerate()` — hardcoded
  `config.freeGenerationCap = 3` vs per-user `freeGenerationsUsed`. `start()`
  calls it and **short-circuits to the paywall BEFORE any network request.**
  So the client blocks locally — a server-only exemption is never reached.
  This is why the fix required a client edit + a new build, not just a
  function deploy.
- **Displays (cosmetic):** `app/(tabs)/profile.tsx`,
  `components/GenerationCounter.tsx`.
- Local-dev `/api/generate` does NOT enforce quota (prod Cloud Function path
  only). Pro-bypass differs by side (server reads `userDoc.subscriptionStatus`;
  client reads RevenueCat `isActive`), so flipping the doc to 'pro' wouldn't
  unblock the client and would also change premium gating — rejected in favor
  of a dedicated `quotaExempt` flag.

**Changes:**
1. `functions/src/generate.ts` — `checkQuotaAndCategory` skips the cap when
   `user.quotaExempt` is true. Premium gate, rate limiter, and downstream
   minor gate untouched. The post-success `freeGenerationsUsed` increment
   still runs (usage/audit record preserved).
2. `hooks/useGeneration.ts` — `canGenerate()` returns true when
   `userDoc.quotaExempt`, mirroring the server. Required because the client
   blocks before sending.
3. `lib/firestore.ts` — `quotaExempt?: boolean` added to `UserDoc`. NOT added
   to `ensureUserDoc` defaults, so it stays absent/false for every normal user.
4. `firestore.rules` — clients may not CREATE-with (other than `false`) or
   UPDATE `quotaExempt`; only the Admin SDK / console (which bypass rules) can
   set it true. Closes the self-exemption hole a new unguarded field would
   otherwise open.

**Deployed (server-side, no rebuild):** `firebase deploy --only
firestore:rules` then `--only functions` to `whatif-98256`. Rules compiled
clean; all 6 functions updated successfully.

**Still required to activate for the reviewer:**
- **Build 11** — the client gate change (#2) ships only in a new build. Until
  then an exempt account is still blocked at #4 by the OLD client gate.
- **Set the flag** — on the reviewer's `users/{uid}` doc set `quotaExempt:
  true` (boolean) via Firebase console or Admin SDK. Do it before the reviewer
  signs in (`userDoc` is read once at sign-in, not live-subscribed).

**Verification:** root + functions `tsc` clean; 19 tests / 7 snapshots pass;
diff confirmed localized — no minor-gate symbol (`runPeopleDetection`,
`isMinorSensitiveCategory`, `isSensitiveRequest`, `serverDetectedMinor`)
appears anywhere in it. Live behavioral checks (exempt account 5+ gens; fresh
account refused at #4) are pending Build 11 + flag-set; the non-exempt refusal
is unchanged by inspection (when `quotaExempt` is absent/false the condition
is byte-for-byte the old one).

**Out of scope (unchanged):** the known TOCTOU race in quota enforcement; the
global cap stays 3 for every other user.

---

## 2026-06-01 — Fix "NaN/3 FREE" counter + first-generation soft-lock for new accounts

**Context:** Build 6 testing surfaced that a brand-new account (Apple Sign
In, never generated) showed *"NaN/3 FREE"* in the home counter and got the
soft toast *"You've reached your free Me Buts…"* on its first generation
attempt — blocked before anything ran. Investigation traced it to a
`users/{uid}` doc that **exists but is missing `freeGenerationsUsed`**
(`undefined`): `Math.max(0, 3 - undefined)` = `NaN`, and
`undefined < 3` = `false` so `canGenerate()` blocks. Root cause is a race:
two writers create the user doc off the same post-auth signal —
`ensureUserDoc` (full create) and `registerPushToken` (merge-create). When
the push-token merge won the create, `ensureUserDoc` saw the doc already
existed and returned it as-is, never backfilling the field. Latent (all
causal code predates Build 6); Build 6 only changed the blocked-path
symptom (paywall modal → soft toast) and made it more visible. Only bites
real devices (push registration no-ops on simulators) with notifications
allowed, on first sign-in (doc doesn't exist yet). Investigation-only
first; then fixed in three commits.

**Changes:**
1. **Defense-in-depth defaults (`?? 0`).** Every client read of
   `userDoc.freeGenerationsUsed` now defaults to 0: `canGenerate()` and
   `remaining` in `hooks/useGeneration.ts`; `remaining` + `used` in
   `app/(tabs)/profile.tsx`. Stops NaN rendering and unblocks
   already-affected users immediately (server tolerates the missing field
   and backfills via increment on first success). `canGenerate()` control
   flow untouched — only the field reads.
2. **Closed the create race at its root.**
   - `lib/firestore.ts`: `ensureUserDoc` now **reconciles an
     existing-but-partial doc** on every call — backfills any missing base
     field with its default, idempotently (no-op on a healthy doc).
     Best-effort + try/catch so a denied write never breaks auth. Skips the
     redundant re-read on the healthy path.
   - `lib/notifications.ts`: `registerPushToken` uses **`updateDoc`**
     instead of `setDoc({merge})`, so it can never CREATE the doc (throws
     `not-found` if called too early; caught and logged).
   - `app/_layout.tsx`: push registration is **gated on a confirmed-loaded
     `userDoc`**, guaranteeing `ensureUserDoc` ran first (also stops the
     token being dropped on the very first launch).
   - `firestore.rules`: **initialization carve-out** — the owner may ADD an
     absent `freeGenerationsUsed` (→ 0) / `subscriptionStatus` (→ 'free')
     so the backfill is permitted, while a usage reset (5 → 0) or a
     self-granted upgrade stays denied.
   - **ACTION REQUIRED:** run `firebase deploy --only firestore:rules` —
     the client-side backfill is denied until the rules ship. Not deployed
     in this change set.
3. **Toast duration 3.2s → 5.5s.** `components/ui/Toast.tsx`: default
   auto-dismiss is now `DEFAULT_TOAST_DURATION_MS = 5500`, and `show()`
   gained an **optional third `duration` param** (`show(msg, kind,
   durationMs)`) for per-message overrides. Backwards-compatible — no
   caller changes needed.

**Forgot Password (investigation only — deferred past Build 7):** the
toast appears but no email arrives. By design (`app/(auth)/login.tsx`
`handleForgotPassword`) the success toast fires **unconditionally**
(anti-enumeration) and any `sendPasswordResetEmail` error is swallowed
into `captureError` — so "toast, no email" is exactly what a silent
failure looks like; the toast is not proof of sending. Most likely either
(a) the Firebase **Email/Password provider is disabled** (app is
Apple-first) → `auth/operation-not-allowed`, or (b) the **test user is
Apple-only** (no password credential / `@privaterelay.appleid.com`) →
`auth/user-not-found`. Email/password sign-IN working in-app would confirm
the provider is enabled, pointing at (b). **Recommend:** check Firebase
Console → Authentication → Sign-in method (Email/Password enabled?), and
check **Sentry** for the `forgotPassword` breadcrumb — the captured
Firebase `code` is the definitive answer.

**Verification:** `npx tsc --noEmit` clean after each commit; `npm test`
green after commit 3. No `eas build` run.

---

## 2026-05-31 — Build 6: remove Apple debug instrumentation, gate paywall, rebrand → "Me But", add Forgot Password

**Context:** Pre-Build-6 cleanup + launch prep. Apple Sign In is verified
working in production, so the temporary diagnostic block could come out;
v1 ships monetization-OFF so the dead paywall must never surface; the App
Store name is changing to **Me But**; and the login screen needed a
password-reset affordance. No rate-limit work — launch is free, cost is
capped via Google Cloud budget alerts, not in-app limits.

**Changes:**
1. **Removed temporary Apple debug instrumentation** (`app/(auth)/login.tsx`):
   restored `handleApple` to its pre-debug form — `if (cred.identityToken)
   { await signInWithAppleIdToken(...) }` guard, `show(friendlyAuthError
   Message(e, 'apple'), 'error')` in the catch, silent return on
   `ERR_REQUEST_CANCELED`. Dropped the JWT decode block, `tokenInfo`, the
   `console.log`, the debug toasts, and the now-unused `captureError`
   import. (captureError was re-added later for Change 4 — see below.)
2. **Gated the paywall behind `V1_MONETIZATION_ENABLED`** so the dead
   Subscribe sheet can never appear in v1. Defense-in-depth:
   - `PaywallModal` returns `null` when the flag is off.
   - Both trigger screens route every paywall site through one local
     `showPaywall()` chokepoint that, when the flag is off, fires a soft
     toast — *"You've reached your free Me Buts. More coming soon!"* — with
     no Subscribe button. Converged sites: `home.tsx` (canGenerate gate
     via `onPaywall`, premium-category gate, premium-trend gate) and
     `[categoryId].tsx` (`onPaywall`). The `useGeneration` server-quota
     path also routes through `onPaywall`, so it inherits the soft toast.
3. **Rebranded WhatIf → "Me But" in user-facing strings only.** Files:
   `app.json` (expo.name + 4 iOS/Android permission strings), login /
   signup / splash (`_layout.tsx`) / index wordmarks (`What`+`If` →
   `Me `+`But`), `result/[id].tsx` eyebrow (`ME BUT`), `generate/results.tsx`
   ("Your Me Buts"), `HomeOnboardingCard` ("Welcome to Me But"),
   `PaywallModal` title ("Unlock Unlimited Me Buts"), `FilteredResultPanel`
   (share captions ×2, share title, on-image watermark text),
   `app/+html.tsx` (title + OG/Twitter/Apple meta ×5), `privacy.tsx`,
   `terms.tsx` (×3), `lib/exportData.ts` (README title + share dialog).
   **Left internal:** bundle id `com.olytoma.whatif`, package.json name,
   folder names, function/var/store names, Firebase project id, git repo,
   and code comments mentioning WhatIf.
4. **Added "Forgot password?" link** (`app/(auth)/login.tsx`, Sign In tab
   only). Calls `sendPasswordResetEmail(auth, email)`. Uses the email
   field if filled; if empty, shows an inline nudge and focuses the field
   (added `emailRef`). Anti-enumeration: ALWAYS shows the exact success
   toast *"If that email exists, a reset link has been sent."* — even on
   throw — and routes real errors to `captureError(e, { where:
   'forgotPassword' })`. Styled as a small right-aligned text link, not a
   button.

**Verification:** `npx tsc --noEmit` clean; `npm test` → 19 passed, 7
snapshots passed. Brand sweep confirms no user-facing "What If"/"WhatIf"
strings remain (only code comments + the `ios/WhatIf` entitlements path in
`app.config.js`). Not committed — left for manual review. No EAS builds run.

---

## 2026-05-31 — Fix Apple Sign In (missing nonce) + per-profile aps-environment

**Context:** Apple Sign In failed on the v1 production build — the native
Apple sheet + Face ID completed, then sign-in died with a misleading
"Wrong email or password" toast. Email/password auth was healthy, so the
break was isolated to the Apple identity-token → Firebase exchange.

**Root cause:** This is a Firebase **JS SDK** app (`firebase/auth`, not
`@react-native-firebase`), so the Apple token is validated server-side via
`signInWithIdp`, which requires a **nonce**. The flow was half-wired:
`signInWithAppleIdToken(idToken, nonce?)` in `lib/auth.ts` already accepted
a `rawNonce`, but `app/(auth)/login.tsx` never generated or passed one, and
`expo-crypto` (needed to SHA-256 a nonce) wasn't installed. Firebase
rejected the credential with `auth/invalid-credential`, which
`friendlyAuthErrorMessage` collapses into the password message (an
intentional anti-enumeration merge — which is why it masqueraded as a
password error).

**Fixes:**
1. **Nonce wiring** (`login.tsx`): installed `expo-crypto`; generate a raw
   nonce (`Crypto.randomUUID()`), SHA-256 hash it (`digestStringAsync`),
   pass the **hash** to `AppleAuthentication.signInAsync({ nonce })` and
   the **raw** nonce to `signInWithAppleIdToken(token, rawNonce)`.
   `lib/auth.ts` needed no change — it was already built for it.
2. **Accurate error path** (`lib/auth.ts`): `friendlyAuthErrorMessage` now
   takes an optional `provider` (`'password' | 'apple'`, default
   `'password'`). Apple `auth/invalid-credential` and
   `auth/missing-or-invalid-nonce` return "Couldn't sign in with Apple.
   Please try again or use email." The email/password path keeps collapsing
   `invalid-credential` into the anti-enumeration message (unchanged). The
   `login.tsx` Apple handler calls it with `'apple'`.
3. **`aps-environment` made per-profile** (`app.config.js`, NEW): the
   committed `ios/WhatIf/WhatIf.entitlements` showed
   `aps-environment: development`, but `ios/` is gitignored (CNG) and
   regenerated by prebuild on every EAS build — hand-editing it is a no-op.
   Added a dynamic `app.config.js` layered on top of app.json that sets
   `ios.entitlements["aps-environment"]` from `EAS_BUILD_PROFILE`:
   production/preview → `production`, development / local-unset →
   `development`. Verified via `expo config --json` that all four cases map
   correctly and NO app.json field is dropped in the merge (bundle id,
   usesAppleSignIn, infoPlist usage strings, extra.eas.projectId, plugins
   all intact).

**Checked, no change needed:** `signup.tsx` (email/password only, no Apple
path); `reauthWithApplePopup` (web popup flow — Firebase handles the nonce
internally; native reauth falls back to email/password, fine for v1).

**Verification:** `npx tsc --noEmit` clean; `npm test` 19/19 tests + 7
snapshots pass.

**Deferred to v1.1** (added as CLAUDE.md todo #11): full web Sign in with
Apple (Apple Services ID + key, Firebase OAuth code-flow config) and Apple
token revocation on account delete. v1 ships native-only Apple sign-in
(token `aud` = bundle id, needs only the enabled Firebase provider) and
email/password reauth fallback for account deletion.

**Next:** requires a fresh `eas build` (run manually) to test the nonce fix
+ production `aps-environment` on device/TestFlight. Firebase Console Apple
provider confirmed enabled.

---

## 2026-05-30 — Disable Sentry source-map auto-upload (first EAS build failed at fastlane)

**Context:** First production EAS build (`eas build --platform ios
--profile production`) failed at the "Run fastlane" Xcode step. The
`@sentry/react-native` plugin injects a build-phase script that calls
`sentry-cli sourcemaps upload`; with no `SENTRY_ORG` /
`SENTRY_AUTH_TOKEN` set in the build env, that script errors out and
fails the whole archive. My Phase 1 audit flagged this as a "silent
no-op, not blocking" — that was incorrect. The runtime SDK no-ops
when DSN is missing; the BUILD-TIME upload step does not.

**Fix:** Created a new production EAS environment variable
`SENTRY_DISABLE_AUTO_UPLOAD=true` (plaintext visibility — it's a
boolean toggle, not a secret). The Sentry build-phase script checks
this var and skips the entire upload sequence (source maps + native
debug symbols) cleanly when set. Created via:

```sh
eas env:create --environment production --name SENTRY_DISABLE_AUTO_UPLOAD \
  --value true --visibility plaintext --scope project --non-interactive
```

**Impact:** Crash reports from the v1 production build will be
unsymbolicated (Hermes byte offsets instead of function names in
stack traces). Crash tracking itself still works — runtime
`Sentry.init()` runs and captures exceptions; only the
release-association + source-map lookup is missing. Adequate for v1.

**v1.1 re-enable** (to get readable stack traces):
1. Sign in to sentry.io, create the project (or use an existing one
   for olytoma).
2. Note the org slug and project slug.
3. Account → Auth Tokens → Create new token, scope
   `project:releases` (sufficient for source-map upload).
4. Create three EAS env vars:
   ```sh
   eas env:create --environment production --name SENTRY_ORG \
     --value <slug> --visibility plaintext --scope project --non-interactive
   eas env:create --environment production --name SENTRY_PROJECT \
     --value <slug> --visibility plaintext --scope project --non-interactive
   eas env:create --environment production --name SENTRY_AUTH_TOKEN \
     --value <token> --visibility secret --scope project --non-interactive
   ```
   Token gets `secret` visibility — write-only, never readable after
   creation; the org and project slugs are plaintext (they appear in
   sentry.io URLs anyway).
5. Delete the disable flag:
   ```sh
   eas env:delete --environment production --name SENTRY_DISABLE_AUTO_UPLOAD
   ```
6. Confirm next build's fastlane log shows
   `[sentry] Uploading source maps...` and the resulting
   sentry.io release has artifacts attached.

**Files touched:** `EAS_ENV_VARS.md` (added the new var to the
required-for-production list, plus the three v1.1 vars under a new
section); `CLAUDE.md` (added a new active-todo #10 for Sentry source-
map re-enable). No source-code changes.

---

## 2026-05-30 — EAS production-build prep (Phase 2 of first App Store submission)

**Context:** Phase 1 audit (read-only) surfaced several release-only
issues — missing `eas.json`, bundle-id mismatch, EXPO_PUBLIC_* env vars
absent from EAS, paywall UI shipping without RC keys configured. This
entry covers the local-file portion of Phase 2; the EAS Secrets
creation step is a separate manual follow-up that needs `eas login`
first.

**Bundle identifier — `app.json`:**
- `ios.bundleIdentifier`: `com.whatif.app` → `com.olytoma.whatif`
  (matches the App Store Connect record under Apple team TZ4AJ7Z3GG).
- `android.package`: same swap. Xcode project (`ios/WhatIf.xcodeproj/
  project.pbxproj`) already had the right value, but `ios/` is
  gitignored and gets regenerated by `expo prebuild` during EAS Build
  — without fixing app.json, prebuild would overwrite with the old id.

**Permissions cleanup — `app.json`:**
- Removed `android.permission.RECORD_AUDIO`. The app does not use the
  microphone anywhere; carrying the permission would invite "what's
  this for?" questions in App/Play review.

**Save-to-camera-roll verified safe:** grepped for MediaLibrary /
`saveToLibraryAsync` / `createAssetAsync` usage. Confirmed the result
save path (`components/FilteredResultPanel.tsx`, `lib/exportData.ts`)
goes through `expo-sharing`'s `Sharing.shareAsync` only — iOS handles
camera-roll writes from inside the share sheet under its own
permission. No `NSPhotoLibraryAddUsageDescription` needed.

**Monetization disabled for v1 (preserve code, hide UI):**

User-decided posture: ship v1 without RevenueCat configured (no
working IAP), but preserve all paywall / Pro-gate / RevenueCat code
in the codebase so v1.1 re-enable is a flag flip + EAS Secret create.

- Added `V1_MONETIZATION_ENABLED` constant in `constants/config.ts`
  with a multi-step v1.1 re-enable recipe in the comment block.
- `constants/categories.ts` — flipped `ethnicity-blend` to
  `isPremium: false` (was the only premium category in the catalog).
  Comment points at the flag and at the two mirrored files.
- `lib/prompts.ts` — `PREMIUM_CATEGORIES` from `new Set(['ethnicity-
  blend'])` to empty `new Set<string>([])`. Comment notes the v1.1
  restoration step and the CLAUDE.md sync rule.
- `functions/src/prompts.ts` — mirrored the same change. Without this
  the server's `checkQuotaAndCategory()` would still 402 on every
  ethnicity-blend request via `isPremiumCategory(category)` —
  defeating the client-side free flip.
- `components/ui/ProBadge.tsx` — added `if
  (!V1_MONETIZATION_ENABLED) return null;` so the badge becomes
  invisible at every call site (CategoryCard lock corner,
  GenerationCounter top-bar, Profile plan card, PaywallModal hero).
  All four call sites and their conditional render logic stay intact.
- `app/(tabs)/profile.tsx` — wrapped the "Upgrade to Pro" Button (the
  only manual paywall-trigger affordance) in
  `{V1_MONETIZATION_ENABLED ? ... : null}`. The PaywallModal
  component, the `paywall` state, and the rest of the plan card stay
  in place. The card now shows `FREE`, plan name, and the
  `0/3 generations used` usage stats — no upgrade CTA.
- DELIBERATELY NOT TOUCHED: `lib/revenuecat.ts`, `hooks/
  useSubscription.ts`, `stores/subscriptionStore.ts`,
  `components/ui/PaywallModal.tsx`, the trend-side paywall trigger in
  `app/(tabs)/home.tsx` (admin-controlled — no trends marked premium
  for v1). The RC SDK already no-ops when API keys are missing
  (`lib/revenuecat.ts:37-40`), so leaving it wired up is harmless.

**Minor gate untouched:** `MINOR_SENSITIVE_CATEGORIES` in
`lib/prompts.ts` and `functions/src/prompts.ts` still contains
`['race-swap', 'gender-swap', 'ethnicity-blend']`. The minor refusal
is independent of the paywall and continues to function — both the
server-side detection re-run and the 403 refusal stay live.

**Snapshot test updated:** `isPremiumCategory snapshot of premium
membership across the catalog` now records `'ethnicity-blend': false`.
Ran via `npm run test:update`. All 19 tests pass, 7 snapshots
(1 updated, 6 unchanged).

**New file — `eas.json`:**
- `development`: developmentClient, internal distribution, iOS
  simulator enabled.
- `preview`: internal distribution, real-device build (no simulator).
- `production`: `distribution: "store"`, `autoIncrement: true` (bumps
  buildNumber locally on each build via `appVersionSource: "local"`),
  `resourceClass: "m-medium"` on iOS for faster build times.
- `submit.production.ios.appleTeamId`: `TZ4AJ7Z3GG`. Apple ID and ASC
  app ID intentionally omitted — EAS Submit will prompt for them on
  the first submission.
- Top-level `_doc` block (ignored by EAS) enumerates the EAS env vars
  that must be created via `eas env:create` before the first
  production build. Includes the two RC vars under
  `secrets_required_for_v1_1_when_monetization_re_enables` for future
  reference. Plaintext env block is deliberately empty so secrets
  never end up in git.

**Typechecks + tests:**
- `npx tsc --noEmit` (root) — clean.
- `cd functions && npx tsc --noEmit` — clean.
- `npm test` — 19/19 pass, 1 snapshot updated.

**Cloud Functions production status (correction to my Phase 1 report):**
Functions were deployed to production on 2026-05-29 — earlier than I
had recorded in CLAUDE.md's active-todos list. The `signBlob`
permission gap (Cloud Function signing the V4 URLs that serve
generation results from Storage) was fixed by granting the App Engine
default service account the Service Account Token Creator role.
Minor-gate verified working in prod on race-swap + gender-swap
(synthetic minors refused, clear adults pass). CLAUDE.md item #10
removed; recent-completions note added.

**Still TODO before first build (handed off to user):**
1. `eas login` (interactive — Claude can't authenticate on user's
   behalf). After login, Claude will run `eas env:create` for the
   eight production env vars enumerated in `eas.json._doc`.
2. Phase 3 (separate doc): exact build + submit command sequence
   including per-prompt guidance for Apple ID / 2FA / cert /
   provisioning-profile choices.
3. Phase 4: physical-device smoke-test checklist before App Store
   submit tap.

**Skipped for v1 (deferred to v1.1):**
- Sentry source-map upload — no `SENTRY_AUTH_TOKEN` set up. Crash
  reports will be unsymbolicated Hermes byte offsets. Quality issue,
  not blocking.
- RevenueCat configuration — see "Monetization disabled for v1" above.

---

## 2026-05-28 — Fill legal-document placeholders across all four policy files

**Substitutions applied:**
- `[YOUR_EMAIL]` → `contact@olytoma.com` (1 spot each in
  `legal/privacy.html`, `legal/terms.html`, `app/privacy.tsx`,
  `app/terms.tsx`).
- `[YOUR_LEGAL_NAME_OR_ENTITY]` → `Olytoma LLC` (preamble + footer in
  both HTML files; tsx files don't reference an entity).
- `[YOUR_COUNTRY/STATE]` and `[YOUR_STATE/COUNTRY]` (the inconsistent
  drafting variant in terms.html) → `Connecticut, USA`.
- Venue clause: replaced the wider phrase `the courts located in
  [PLACEHOLDER]` → `the state and federal courts located in
  Connecticut, USA` (user confirmed the adjusted phrasing to avoid a
  duplicated "courts located in").
- `[YOUR_MAILING_ADDRESS_OR_OMIT]`: deleted the entire postal-address
  line plus the now-orphaned `<br>` and "Postal address:" label in
  both HTML contact blocks. User explicitly chose not to publish a
  mailing address.

**HTML cleanup:** removed the `<span class="placeholder">…</span>`
wrappers everywhere a real value replaced a placeholder, so the
filled-in values no longer render with the yellow highlight that
signaled "still a placeholder".

**Stopped before guessing:** caught one slug (`[YOUR_STATE/COUNTRY]` in
the terms.html governing-law clause) that didn't literally match the
user's list — it was my original drafting inconsistency vs the
`[YOUR_COUNTRY/STATE]` in privacy.html. Asked the user to confirm
rather than assume, then applied `Connecticut, USA`. Also confirmed the
venue grammar fix before applying.

**Verification:**
- `grep -n "\[YOUR" ...4-files` → no matches (exit 1).
- `grep -c "contact@olytoma.com" ...4-files` → 1 per file (4 total).
- `Olytoma LLC` → 2 per HTML (preamble + footer), 0 in tsx (expected).
- `Connecticut` → 1 in privacy.html, 2 in terms.html, 0 in tsx.
- `npx tsc --noEmit` → exit 0, clean.

---

## 2026-05-27 — Wire in-app Profile rows to the hosted policy URLs; sync in-app copies

**Context:** Followed up on the HTML drafts (entry below) by pointing
the Profile screen's Privacy/Terms rows at the hosted GitHub Pages URLs
so policy updates no longer require an app release, and brought the
in-app fallback screens into sync with the canonical HTML.

**Changes:**
- `app/(tabs)/profile.tsx` — added `Linking` to the `react-native`
  import; added two top-level constants
  (`PRIVACY_URL = https://hansofcanalst.github.io/whatif-legal/privacy.html`,
  `TERMS_URL = .../terms.html`) with a short comment explaining why
  Profile opens the hosted version while the in-app screens stay as
  offline fallbacks; replaced the two `router.push('/privacy'|'/terms'
  as never)` handlers with `Linking.openURL(URL).catch(console.warn-
  style)`; removed the now-stale typed-routes cast comment that sat
  above the privacy/terms rows (the cast at the dev prompt-eval long-
  press handler below is self-evident on its own).
- `app/privacy.tsx`, `app/terms.tsx` — updated `LAST_UPDATED` from
  `'April 2026'` to `'May 27, 2026'` to match the HTML versions, and
  replaced the `[email protected]` contact stub with `[YOUR_EMAIL]`
  so the in-app and hosted copies share the same placeholder convention
  (user fills both in once they pick a contact address).

**Rationale for keeping the in-app screens:** Only the Profile rows
linked to them, so they're effectively orphaned UI now. But they're
cheap to keep, remain reachable via deep link / `router.push`, and
serve as an offline-accessible fallback for the rare user who hits
Profile without connectivity. Deleting them would be a real-but-small
loss of robustness with no maintenance upside.

**Verification:** `npx tsc --noEmit` clean. No tests touch these
files (snapshot tests cover only prompt catalogs).

---

## 2026-05-27 — Draft real Privacy Policy and Terms of Service as standalone HTML for GitHub Pages hosting

**Context:** App Store submission requires real, publicly hosted Privacy
Policy and Terms URLs. The in-app `app/privacy.tsx` and `app/terms.tsx`
screens were first-pass drafts using a placeholder `[email protected]`
contact and were never intended to satisfy a reviewer or stand as the
canonical legal documents.

**Added:**
- `legal/privacy.html` — standalone, self-contained HTML privacy policy
  covering: what we collect (uploaded photos, account info, generation
  history, subscription state, telemetry, crash reports, device
  metadata); how we use it; the sub-processor list (Google Gemini,
  Firebase, Sentry, Apple, RevenueCat-when-active); US data residency
  with EEA/UK transfer note; retention; user rights (GDPR + CCPA
  language); the 17+ rating and server-side minor-detection safety
  layer; security; change-notification posture; contact.
- `legal/terms.html` — standalone HTML ToS covering: acceptance,
  17+ eligibility, account, service description, user content +
  narrow operating license (no model-training use), AI-output
  disclaimer and disclosure obligation, detailed acceptable-use list
  (including the no-minors / no-impersonation / no-bypass-the-gate
  clauses), subscriptions/auto-renewal/refunds, IP, third-party
  services, copyright complaints procedure, all-caps warranty and
  liability disclaimers, indemnification, termination, Apple App Store
  EULA addendum (eight required clauses), governing-law placeholder,
  changes, miscellaneous, contact.

**Placeholders left intentionally:** `[YOUR_EMAIL]`,
`[YOUR_LEGAL_NAME_OR_ENTITY]`, `[YOUR_COUNTRY/STATE]`,
`[YOUR_COUNTY/CITY, STATE/COUNTRY]`, `[YOUR_MAILING_ADDRESS_OR_OMIT]`.
User explicitly asked not to invent a contact email.

**Caveat surfaced to the user:** Reasonable starting templates only,
not legal advice. Given the app handles user photos and runs minor
detection, attorney review is recommended before relying on them.

**Hosting:** Files are standalone (self-contained CSS, no build step)
and ready to copy into a dedicated `whatif-legal` GitHub Pages repo
under hansofcanalst, producing URLs like
`https://hansofcanalst.github.io/whatif-legal/privacy.html` and
`/terms.html` for App Store Connect. Step-by-step instructions given
in the chat reply.

**No code touched** — purely additive in the `legal/` directory. No
typecheck or test impact.

---

## 2026-05-26 — Distinguish 403 minor-gate refusal from transient failures on the results screen

**Symptom:** A 403 from the server-side minor gate flowed through
`streamGeneration` as a generic `Error("Generation failed (403): …")`,
the hook flipped every pending slot to `failed` with that message, and
the results screen unconditionally rendered the "All transformations
failed / This usually clears in a minute / Try Again" panel — mis-framing
a deliberate, permanent policy refusal as a transient glitch and
inviting a retry that would just hit the gate again.

**Root cause:** `lib/gemini.ts streamGeneration` collapsed every non-OK
HTTP status (other than 402) into a stringified `Error`. The status code
never made it to the UI layer, so the results screen couldn't tell a
403 (terminal refusal) from a 503 (detection fail-closed, legitimately
retryable) from any other 5xx.

**Fix:**
- `lib/gemini.ts` — new `GenerationHttpError` carrying `status` + `body`;
  thrown in place of the stringified Error.
- `stores/generationStore.ts` — added optional `kind: 'transient' |
  'terminal'` to `GenerationSlot`; `failSlot()` takes an optional kind
  (defaults to 'transient' for back-compat).
- `hooks/useGeneration.ts` — on `GenerationHttpError` with status 403,
  tag pending slots as `kind: 'terminal'` with the neutral copy "This
  transformation isn't available for this photo." Everything else (5xx
  including the 503 detection-gate path, network, fatal) stays
  `transient` with existing copy.
- `app/generate/results.tsx` — bottom panel now has two flavors. When
  every failure is terminal: show "This transformation isn't available
  for this photo." and hide Try Again. When any transient failure
  exists (all-transient or mixed-all-failed): keep the existing
  retry-friendly panel.

**Mixed-batch posture:** Today the 403 is request-level (gates the
whole batch), so mixed terminal+transient can't happen in practice. The
framework now supports it: a single terminal slot won't suppress retry
for a transient sibling, and because Try Again navigates back to the
picker (no auto-fire), retry never re-runs the 403'd item without an
explicit user re-selection.

**Verification:** `npx tsc --noEmit` (root + functions) clean.
`npm test` 19/19, 7 snapshots intact.

---

## 2026-05-25 — Make `resolveApiBase()` work when `hostUri` is empty (`expo run:ios` debug builds)

**Symptom:** After fixing the relative-URL issue, detection threw
`No API base URL available... Constants.expoConfig.hostUri is populated`
on a dev build launched via `npx expo run:ios` (build log: "Skipping
dev server").

**Root cause:** `Constants.expoConfig.hostUri` is only populated when
the manifest is fetched from a `@expo/cli` dev server. In a `run:ios`
build that "skips" starting Metro and later attaches to a separately
running `npm start`, the manifest may arrive without `hostUri`, so the
single-source lookup failed even though Metro was actually reachable
(the JS bundle had clearly loaded — otherwise the app wouldn't run).

**Fix (`lib/apiBase.ts`):** broaden the native-dev resolution into a
fallback chain, in order of semantic preference → most authoritative:

1. `Constants.expoConfig?.hostUri` (manifest from `expo start`).
2. `Constants.expoGoConfig?.debuggerHost` (Expo Go only).
3. `NativeModules.SourceCode.getConstants().scriptURL` — the URL React
   Native itself used to load the JS bundle. In any debug build this is
   `http://<metro-host>:8081/index.bundle?...`, so it's always populated
   when Metro is reachable, regardless of how the dev client was
   launched. Release builds yield `file://` — `originFromUrl()`
   ignores non-network schemes so we don't pick it up there.
4. `Constants.experienceUrl` (e.g. `exp://host:8081`) as a final dev
   fallback. `exp(s)://` is mapped to `http(s)://`.

The loud throw is preserved as the terminal fallback so a misconfigured
release build still fails visibly rather than silently issuing relative
fetches.

**Helpers added:** `hostUriToOrigin()` (normalises `host:port` /
schemes), `originFromUrl()` (strips path/query, rewrites `exp(s)://`),
`originFromScriptURL()` (safe read of the RN bridge module).

**Files changed:** `lib/apiBase.ts`.

**Validated:** `npx tsc --noEmit` clean; `npm test` clean (19/19, 7
snapshots).

**Next:** user retries detection on the simulator. If `scriptURL` is
also unavailable for any reason, the new error message points them at
`npm start` rather than at a specific Expo field.

---

## 2026-05-25 — Fix "detection failed [TypeError: Network request failed]" on native dev

**Root cause:** `lib/detect.ts:resolveEndpoint` and
`lib/gemini.ts:resolveEndpoint` returned a bare relative URL
`/api/detect` / `/api/generate` whenever `EXPO_PUBLIC_CLOUD_FUNCTIONS_URL`
was unset (which is the local-dev default — `.env` has no such key).
React Native's `fetch` forwards URLs straight to NSURLSession / OkHttp,
neither of which can resolve a relative URL because a native app has no
implicit page origin. Every detect / generate call surfaced as
`TypeError: Network request failed` before the request ever left the
device. Web worked because the browser resolves `/api/detect` against
the page origin (the Metro dev server).

**Ruled out** during investigation: ATS
(`NSAllowsLocalNetworking=true` is already set in
`ios/WhatIf/Info.plist`), Expo Router origin auto-injection (it
doesn't exist in `expo-router` 6 for client fetches — the
`extra.router.origin` setting only feeds the dev CORS middleware and
the prod-export server URL), and localhost-vs-LAN-IP (moot — no host
got resolved at all).

**Fix:** new shared helper `lib/apiBase.ts` exporting `resolveApiBase()`
and `isLocalDevApi()`. Precedence: configured cloud-functions URL →
empty string on web (browser fills in the origin) →
`Constants.expoConfig.hostUri` turned into `http://<host>:<port>` on
native dev. Throws loudly on native with neither — a release build
pointed at nothing is a config error, not a silent fetch failure. Both
`lib/detect.ts:resolveEndpoint` and `lib/gemini.ts:resolveEndpoint`
now delegate to it. `npx tsc --noEmit` clean; 19/19 snapshot tests
pass.

---

## 2026-05-25 15:30 EDT — Fix "stuck on Loading the multiverse…" cold-boot hang

**Root cause (not what was suspected):** A signed-in user cold-booting
with a cached Firebase session lands at `/index` (`app/index.tsx` — the
splash with the "Loading the multiverse…" tagline), and the AuthGate
redirect in `app/_layout.tsx:52-59` had no clause for it:

- `!user && !inAuth` → false (user IS signed in)
- `user && inAuth` → false (we're at `/`, not in the `(auth)` group)
- No redirect fires; user stays on the splash forever.

The bug has been latent since the initial scaffold — it only surfaces
when someone lands at `/` while signed in. Fix #3 (the `useToast` work
in `hooks/useAuth.ts`) did NOT introduce it; the redirect logic just
never covered this case. The `[push] skipping` + `[revenuecat] API key
missing` warnings the user saw confirm `user` had been set: those
effects run when `user` is defined, regardless of `loading`.

**The `show`-instability hypothesis was investigated and ruled out.**
`show` IS referentially stable in Toast.tsx — wrapped in `useCallback`
with empty deps. Although the `<Ctx.Provider value={{ show }}>` literal
creates a new object each render, consumers via `const { show } =
useToast()` destructure the `.show` property by value, and that
property value (the function reference) doesn't change. So the auth
`useEffect`'s `show` dep does not cause it to re-run.

**Changes (2 files):**

- Edit: `app/_layout.tsx` — AuthGate's redirect now also fires for a
  signed-in user at the splash route (`pathname === '/'`), sending
  them to `/(tabs)/home`. Used `usePathname()` rather than
  `segments.length === 0` because expo-router's typed-routes gives
  `segments` a non-empty tuple type that rejects the length check.
- Edit: `hooks/useAuth.ts` — defensive: pull `show` through a `useRef`
  so the auth-subscription effect doesn't list it as a dep at all. The
  listener now subscribes exactly once per hook mount, immune to any
  future change in `Toast.tsx` that would destabilize `show`.

**Verification:** `npx tsc --noEmit` clean; `npm test` 19/19 prompt
snapshot tests pass. The hang is fixed end-to-end in code review;
recommend the user cold-boot the app once signed in to confirm —
expected behavior is an immediate hop from the splash to
`/(tabs)/home`.

---

## 2026-05-25 14:05 EDT — Add remote-updatable Trending categories

**What & why:** Foundation for riding TikTok-style viral trends
without an App Store release. Trends are authored to Firestore
(`trending/{trendId}`) and rendered in a new "Trending This Week 🔥"
horizontal carousel above the home-screen photo uploader. Clients
fetch with stale-while-revalidate against an AsyncStorage cache so
the carousel paints instantly on cold launch and survives offline.

**Security posture (the critical part):**

- `firestore.rules` — added `trending/{trendId}`: public-read-when-
  `active == true`, all client writes denied. Only Admin SDK
  (scripts/add-trend.mjs) or the Firebase console can publish, edit,
  or retire a trend.
- The wire contract carries **only `trendId`** — never a
  `promptTemplate`. The server (both `app/api/generate+api.ts` and
  `functions/src/generate.ts`) re-fetches the canonical doc by id
  and uses ITS promptTemplate. A modified client substituting its
  own prompt is structurally impossible.
- Both server resolvers (`lib/trends-server.ts` for local-dev via
  Firestore REST, `functions/src/trends.ts` for production via
  firebase-admin) re-check `active == true` AND the
  startDate/endDate window. Refuse with 410 Gone on stale/expired,
  404 on not-found, 503 on transient failure.
- Trends with `sensitiveCategory: true` plug into the existing
  minor-detection gate — same `runPeopleDetection` call as race-swap
  / gender-swap / ethnicity-blend, just gated by the trend doc's
  flag instead of `isMinorSensitiveCategory(category)`.
- `trend.isPremium` re-paywalls behind Pro server-side; the Cloud
  Function quota+category check is updated to accept a
  `ServerTrendingDoc | null` and route premium-ness through it.
- `trendId` charset is restricted (`/^[A-Za-z0-9_-]{1,128}$/`) at
  both resolvers so a hostile client can't path-traverse into
  another Firestore collection.

**Changes (12 files):**

- New: `lib/trends.ts` — `TrendingDoc` type, `fetchTrendsFromFirestore`,
  `loadTrendsStaleWhileRevalidate` (AsyncStorage cache), `isTrendLive`
  filter.
- New: `lib/trends-server.ts` — server-side resolver for the local-dev
  route. Uses the Firestore REST API directly so it doesn't pull
  react-native modules through `lib/firebase.ts`.
- New: `functions/src/trends.ts` — production resolver via firebase-
  admin. Same shape + same `isServerTrendLive` logic, kept in sync
  with lib/trends-server.ts as a hard requirement.
- New: `components/TrendingCarousel.tsx` — horizontal carousel,
  FRAME-styled cards with per-trend gradient backgrounds (CSS linear-
  gradient on web; solid fallback on native — `expo-linear-gradient`
  is a future swap).
- New: `functions/scripts/add-trend.mjs` — admin publish script.
  Plain ESM (not .ts) because Node 22 runs ESM natively and a tsc /
  tsx step adds weight without buying real safety on a 60-line tool.
  Picks up Application Default Credentials by default; honors
  `GOOGLE_APPLICATION_CREDENTIALS` for CI.
- New: `functions/package.json` script — `npm run add-trend`.
- Edit: `firestore.rules` — added the `trending/{trendId}` rule
  (public read when active, no client writes).
- Edit: `lib/gemini.ts` — `GenerateRequest` gets optional `trendId`.
- Edit: `hooks/useGeneration.ts` — `start()` accepts `trendId` +
  `trendLabel`, forwards trendId to the server and uses trendLabel
  for the pending slot tile (since `getCategory('trending')` returns
  undefined).
- Edit: `app/api/generate+api.ts` — resolves the trend (404/410/503
  on failure) BEFORE the minor-detection gate, then uses
  `trend.sensitiveCategory` to drive the sensitive-request flag and
  `trend.promptTemplate` as the per-variant base prompt. moderation_log
  rows now carry `trendId`.
- Edit: `functions/src/generate.ts` — same shape as the local-dev
  route. `checkQuotaAndCategory` now takes a `ServerTrendingDoc | null`
  to route premium-ness through the trend doc.
- Edit: `app/(tabs)/home.tsx` — wires the carousel above the photo
  uploader, runs the stale-while-revalidate trend loader on mount,
  adds a `RefreshControl` for pull-to-refresh, mirrors the full
  category-gate stack (photo → detection → safety verdict → minor
  → premium → consent) for trend taps, reuses the consent modal for
  premium trends.
- Edit: `PROJECT_OVERVIEW.md` — new §6.1 "Trending categories
  (remote-updatable)" + the `trending/{trendId}` schema entry in §5
  + `trendId` added to the moderation_log shape.

**Admin tooling — recommendation:** `functions/scripts/add-trend.mjs`
over a markdown how-to. The script enforces required-field validation
(id charset, label length, prompt length, gradient non-empty), shows
CREATE vs UPDATE in its console output, and preserves `createdAt`
across edits. A markdown doc would re-create the same field-by-field
data entry through the Firebase console UI but lose the validation
and the in-app preview that comes from rerunning a one-line command.

**Verification:**
- `npx tsc --noEmit` (app) — clean.
- `cd functions && npx tsc --noEmit` — clean.
- `npm test` — 19/19 prompt snapshot tests pass (no prompt-catalog
  changes; this fix is orthogonal).
- Read-side rules sanity-check: the home query is
  `where('active', '==', true)` with `orderBy('sortOrder')` — covered
  by the default single-field indexes, no composite-index deploy
  needed.

**Manual steps for you:**

1. **Deploy the rules** so `trending/{trendId}` is published:
   `firebase deploy --only firestore:rules`.
2. **Authenticate once for the admin script**:
   `gcloud auth application-default login`.
   (Or set `GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json` for CI.)
3. **Publish your first trend**: edit the `TREND` object at the top
   of `functions/scripts/add-trend.mjs` and run
   `cd functions && npm run add-trend`. The script ships with a
   seeded "1970s Disco" example you can use as a smoke test.
4. **Optional: verify the rules** via the Firebase console's Rules
   Playground — `get` on `trending/{your-trend-id}` from an
   unauthenticated session should `allow` when `active == true` and
   `deny` otherwise.
5. The Cloud Functions changes need a redeploy before the production
   path picks up trend handling:
   `firebase deploy --only functions:generate`.

---

## 2026-05-25 12:51 EDT — Fix Release-only launch crash (EXC_BAD_ACCESS in convertNSExceptionToJSError)

**What & why:** `npx expo run:ios --configuration Release` produced an app
that crashed on launch with `EXC_BAD_ACCESS (SIGSEGV)`. Initial frames
pointed at `facebook::react::TurboModuleConvertUtils::convertNSExceptionToJSError`
on `com.meta.react.turbomodulemanager.queue`, which suggested a native
module throwing an NSException at startup. After landing four defensive
guards (described below), the crash persisted but the simulator log
finally revealed the actual cause:

```
[FirebaseError: Firebase: Error (auth/invalid-api-key).]
  code: 'auth/invalid-api-key'
```

Firebase Auth was being initialized with an EMPTY `apiKey` in Release,
spamming `auth/invalid-api-key` errors that eventually corrupted Hermes
GC. Grepping the built `main.jsbundle` confirmed zero matches for the
Firebase API key, project id, OR Sentry DSN — none of the
`EXPO_PUBLIC_*` values had been inlined.

**Root cause:** `constants/config.ts` was reading env via a helper
`env(publicKey, fallbackKey)` that did `process.env[publicKey]` — a
**dynamic** bracket access with a variable key. babel-preset-expo /
Metro's `transform-define` only inline EXPO_PUBLIC_* vars at **static**
property accesses like `process.env.EXPO_PUBLIC_FOO`. The dynamic form
left the bundle reading from a runtime `process.env` that, in Release,
contains only a few baseline vars (NODE_ENV, EXPO_OS) — never the user
ones. Debug worked because Metro serves a populated `process.env` at
runtime over the dev socket, masking the bug until the JS got frozen
into a Release bundle.

**Changes:**

1. **`constants/config.ts`** (primary fix) — replaced the `env()`
   helper with static `process.env.EXPO_PUBLIC_*` references for every
   key (Firebase ×6, RevenueCat ×2, Cloud Functions, Sentry). Kept the
   `extra.*` app.json fallback as a secondary path. Documented the
   static-vs-dynamic gotcha in a header comment so this regression
   can't sneak back in.

2. **`lib/revenuecat.ts`** (defensive) — `initRevenueCat` now returns
   `boolean`, wraps `Purchases.configure` in try/catch, and exports
   `isRevenueCatConfigured()`. Catches the latent bug where a missing
   API key (or a configure that threw natively) left `initialized`
   false but callers had no way to check.

3. **`hooks/useSubscription.ts`** (defensive) — moved
   `Purchases.addCustomerInfoUpdateListener(...)` from running
   synchronously after the async init IIFE was kicked off, to running
   INSIDE the IIFE only after `initRevenueCat` resolved successfully.
   The old shape registered the listener before `configure` ran (the
   awaited init yielded control back to the surrounding effect first)
   — on iOS this raises an NSException "Purchases has not been
   configured" which RN 0.81's `convertNSExceptionToJSError` SIGSEGVs
   on. Added `cancelled` flag + listener ref so the cleanup is safe
   regardless of where the effect tears down.

4. **`lib/notifications.ts`** (defensive) — moved
   `Notifications.setNotificationHandler(...)` from running at module
   evaluation time (a native TurboModule call before the JS runtime is
   fully ready in Release) into a lazy `ensureForegroundHandler()`
   that runs from `setupNotificationListeners` (called from a
   useEffect, post-init). Wrapped in try/catch.

5. **`app/_layout.tsx`** (defensive) — wrapped the module-level
   `initSentry()` call in try/catch. The existing JS-side try/catch
   inside `lib/sentry.ts` can't catch a native SIGSEGV from the
   conversion path; the outer wrap at least prevents a synchronous JS
   throw from aborting bundle evaluation.

**Verification:**
- `npx tsc --noEmit` — clean.
- `npm test` — 19/19 prompt snapshot tests pass.
- Manual bundle grep: rebuilt
  `/Users/SoftDev/Library/Developer/Xcode/DerivedData/WhatIf-*/Build/Products/Release-iphonesimulator/main.jsbundle`
  now contains 1 match each for the API key, project id, and Sentry
  DSN (was 0 before).
- `npx expo run:ios --configuration Release --device "iPhone 17 Pro"`
  rebuilt successfully (Build Succeeded, 0 errors). App installed and
  launched on simulator and **stayed alive 26+ seconds** (`ps` shows
  PID 13832 in `Ss` state). No new entry in
  `~/Library/Logs/DiagnosticReports/`; most recent crash there is
  still the pre-fix one (`WhatIf-2026-05-25-123956.ips`). Simulator
  logs show no `firebase`-tagged errors and no error-level messages
  from the WhatIf process post-launch.

**Manual steps for you:**
- None. The build is running on the simulator now; smoke-test the
  sign-in → photo → generate flow when you get a chance to confirm
  Pro-status sync and other auth-gated paths still behave.
- The defensive guards (#2–#5 above) can stay even if they weren't
  the proximate cause — each closes a real failure mode (RC
  pre-configure race, module-eval native call, Sentry-init throw).

**Notes:**
- The `auto-commit` hook visible in recent `git log` likely picked up
  these changes already; double-check before manually committing.
- Pre-existing iOS deployment-target warnings (`Pods/Sentry-Sentry`,
  `Pods/SDWebImage`) still print in the build log. Not related to
  this fix; safe to ignore for now.

---

## 2026-05-24 19:18 EDT — Verified Sentry fix: iOS build succeeded

**What & why:** Ran `npx expo run:ios` end-to-end to confirm the
`SENTRY_DISABLE_AUTO_UPLOAD=true` change from the previous entry
actually unblocked the build.

**Result:**
- `Build Succeeded` — 0 errors, 3 warnings.
- Both Sentry build phases ran without erroring:
  `Executing WhatIf » Bundle React Native code and images` (wraps
  `sentry-xcode.sh`) and `Executing WhatIf » Upload Debug Symbols to
  Sentry` (wraps `sentry-xcode-debug-files.sh`). No `sentry-cli`
  "organization ID or slug is required" message anywhere in the log.
- App installed to iPhone 17 Pro simulator and launched the
  expo-development-client URL. Metro waiting on `http://localhost:8081`.

**No files touched.** Verification only.

**Warnings worth noting (pre-existing, not blockers):**
- `Pods/Sentry-Sentry: iOS@11.0 deployment version mismatch, expected
  >= 2.0 <= 26.5.99` — Sentry pod's deployment target is older than
  Expo expects. Not caused by this fix; would also appear without it.
  Safe to ignore for now; revisit if Sentry SDK is upgraded.
- `Pods/SDWebImage-SDWebImage: iOS@9.0 deployment version mismatch`
  — same kind of warning from a transitive image-caching pod. Ignore.

**Manual steps for you:**
- App is running on the simulator now. Use it to confirm a smoke flow
  (sign in → pick photo → generate) actually works against Metro on
  this build, since this is the first true native dev build per
  CLAUDE.md todo #1. With this build working, todos #2–#5 (push notifs,
  camera, reauth flow, native Apple/Google reauth) are now testable.

---

## 2026-05-24 19:10 EDT — Disable Sentry source-map upload in iOS build

**What & why:** `npx expo run:ios` was failing during the "Bundle React
Native code and images" build phase with `sentry-cli` errors:
`"An organization ID or slug is required (provide with --org)"`.
The project has `@sentry/react-native` installed and listed in
`app.json` plugins, but no Sentry account/DSN/org is configured.
Sentry's xcode scripts (`sentry-xcode.sh`, `sentry-xcode-debug-files.sh`)
print this hint themselves: set `SENTRY_DISABLE_AUTO_UPLOAD=true` to
skip upload.

**Changes:**
- `ios/.xcode.env.local` — added `export SENTRY_DISABLE_AUTO_UPLOAD=true`
  with a short comment explaining why. This file is sourced by both
  Sentry build phases (the bundling phase sources it inline; the
  debug-files phase sources it via React Native's `with-environment.sh`),
  so one line covers both upload steps.

**No other files touched.** Runtime Sentry behavior is unchanged —
`lib/sentry.ts` already no-ops when no DSN is set, so disabling the
build-time upload doesn't affect anything observable.

**Build/test status:**
- Did not run a full `npx expo run:ios` — long build, requires Xcode
  signing config. Fix is targeted at the exact env var the failing
  scripts check, so the next iOS build should get past that phase.
- Did not run typecheck/tests — change is iOS build-config only, no
  TS/JS touched.

**Known limitations / unresolved:**
- `ios/.xcode.env.local` is gitignored (per Expo's iOS template) and
  will NOT survive `expo prebuild --clean`. If that ever happens,
  re-add the export line. If this becomes annoying, a small Expo
  config plugin can write it on every prebuild — flag if so.
- Android has analogous Sentry build phases. Not touched here because
  only iOS was failing. If Android starts erroring with the same
  message, the equivalent fix is to add
  `sentry.disable-auto-upload=true` to `android/sentry.properties`
  (or `SENTRY_DISABLE_AUTO_UPLOAD=true` in the Gradle env).

**Manual steps for you:**
- Re-run `npx expo run:ios` and confirm the build gets past the
  "Bundle React Native code and images" phase without sentry-cli
  errors.

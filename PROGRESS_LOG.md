# Progress log

Newest entries at the top. Each entry is a self-contained summary of
one task/change set — written so it can be pasted as-is for review.

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

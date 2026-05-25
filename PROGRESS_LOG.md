# Progress log

Newest entries at the top. Each entry is a self-contained summary of
one task/change set — written so it can be pasted as-is for review.

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

# Progress log

Newest entries at the top. Each entry is a self-contained summary of
one task/change set — written so it can be pasted as-is for review.

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

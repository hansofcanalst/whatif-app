import React, { useEffect, useMemo } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { ToastProvider } from '@/components/ui/Toast';
import { useGenerationStore } from '@/stores/generationStore';
import { colors, spacing, typography } from '@/constants/theme';
import { assertFirebaseConfigured } from '@/constants/config';
import { initSentry, setSentryUser, Sentry } from '@/lib/sentry';
import { registerPushToken, setupNotificationListeners } from '@/lib/notifications';
import { OnboardingTutorial } from '@/components/OnboardingTutorial';

// Initialize Sentry as early as possible — at module evaluation time,
// before any React tree is built. This way an error during the very
// first render gets captured. initSentry() no-ops cleanly when no DSN
// is configured, so contributors without a Sentry account see zero
// impact. See lib/sentry.ts for the full design rationale.
initSentry();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useSubscription();
  const segments = useSegments();
  const router = useRouter();
  const hydrateLocalGallery = useGenerationStore((s) => s.hydrateLocalGallery);

  // Hydrate the AsyncStorage-backed gallery once per app launch. Runs
  // independent of auth state because the local gallery exists even for
  // signed-out dev sessions (the local /api/generate route doesn't
  // require auth). We deliberately don't gate this on `loading` — the
  // hydration is non-blocking and we want the Gallery tab to show
  // persisted entries the instant the user opens it.
  useEffect(() => {
    hydrateLocalGallery();
  }, [hydrateLocalGallery]);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)/home');
    }
  }, [user, loading, segments, router]);

  // Tag every Sentry event with the user's uid (or clear on sign-out),
  // so errors are attributable per-user without us ever sending PII.
  // Email/displayName are deliberately NOT shipped — see lib/sentry.ts.
  useEffect(() => {
    setSentryUser(user?.uid ?? null);
  }, [user]);

  // Register the device's Expo push token whenever a user is signed in.
  // No-ops on web, simulators, and signed-out sessions. We only need to
  // run this once per (uid, device) pair, but registerPushToken is
  // idempotent at the Firestore level so re-running on every effect
  // tick is fine — it's a single setDoc with merge.
  useEffect(() => {
    if (!user) return;
    registerPushToken(user.uid).catch((e) =>
      console.warn('[layout] push registration failed', e),
    );
  }, [user]);

  // Notification-tap deep-linking. When the user taps a "your
  // generation is ready" push, the notification's data.route field
  // points at /result/{id}?idx=0 — we navigate there. Listener
  // lifecycle is gated by `user` so we don't try to push to gated
  // routes when the user is signed out (the AuthGate would intercept
  // and redirect anyway, but cleaner not to fire the navigation in
  // the first place).
  useEffect(() => {
    if (!user) return;
    const cleanup = setupNotificationListeners((data) => {
      const route = typeof data.route === 'string' ? data.route : null;
      if (!route) return;
      // expo-router accepts string paths; cast through never to
      // bypass typed-routes strictness for dynamic deep-links.
      router.push(route as never);
    });
    return cleanup;
  }, [user, router]);

  if (loading) {
    return (
      <View style={errStyles.splash}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={errStyles.splashText}>Loading…</Text>
      </View>
    );
  }

  // Tutorial is rendered HERE (inside AuthGate) rather than at the
  // RootLayout level so it has access to `user` without re-querying.
  // It self-gates on AsyncStorage so it only renders once per fresh
  // install + after a signed-in session is established.
  return (
    <>
      {children}
      <OnboardingTutorial signedIn={!!user} />
    </>
  );
}

function ConfigError({ message }: { message: string }) {
  return (
    <View style={errStyles.container}>
      <Text style={errStyles.title}>Setup required</Text>
      <Text style={errStyles.body}>{message}</Text>
    </View>
  );
}

const errStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.accent, marginBottom: spacing.md },
  body: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  splashText: { ...typography.body, color: colors.textSecondary },
  // Crash-fallback "Try again" button. Kept ultra-minimal so this code
  // path doesn't depend on the Button component (which itself could be
  // the source of the crash being recovered from).
  errorDetail: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
    fontFamily: 'monospace',
  },
  button: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignSelf: 'flex-start',
  },
  buttonText: { ...typography.bodyBold, color: '#ffffff' },
});

export default function RootLayout() {
  const configError = useMemo(() => {
    try {
      assertFirebaseConfigured();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Firebase config error';
    }
  }, []);

  if (configError) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <ConfigError message={configError} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Sentry's ErrorBoundary catches render-time exceptions in the
          React tree and reports them to Sentry, then renders the
          provided fallback. We deliberately wrap the *content* layer
          (after GestureHandlerRootView and the StatusBar) so a render
          crash inside a screen doesn't strip the safe area or status
          bar styling — the user still sees a usable shell.

          The fallback gives the user a "Try again" button that resets
          the boundary's error state. Most UI bugs get past this clean
          on a re-render; for ones that don't, the user can force-quit. */}
      <Sentry.ErrorBoundary fallback={CrashFallback}>
        <ToastProvider>
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <StatusBar style="light" />
            <AuthGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'fade',
                }}
              >
                <Stack.Screen name="index" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="generate/[categoryId]" />
                <Stack.Screen name="generate/results" />
                <Stack.Screen name="result/[id]" />
                <Stack.Screen name="privacy" />
                <Stack.Screen name="terms" />
              </Stack>
            </AuthGate>
          </View>
        </ToastProvider>
      </Sentry.ErrorBoundary>
    </GestureHandlerRootView>
  );
}

// Fallback shown when the root ErrorBoundary catches a render
// exception. Kept simple on purpose — this UI must not depend on any
// of the contexts (Toast, Auth, theme tokens beyond colors) that
// might themselves be the source of the crash. Plain View + Text +
// Pressable, no hooks beyond what Sentry's API provides via props.
function CrashFallback({ error, resetError }: { error: unknown; resetError: () => void }) {
  return (
    <View style={errStyles.container}>
      <Text style={errStyles.title}>Something went wrong</Text>
      <Text style={errStyles.body}>
        We've logged the error. Tap below to try again — if it keeps happening, force-quit and reopen the app.
      </Text>
      {error instanceof Error ? (
        <Text style={errStyles.errorDetail}>{error.message}</Text>
      ) : null}
      <Pressable onPress={resetError} style={errStyles.button}>
        <Text style={errStyles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

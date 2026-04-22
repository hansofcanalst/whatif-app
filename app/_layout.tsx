import React, { useEffect, useMemo } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { ToastProvider } from '@/components/ui/Toast';
import { colors, spacing, typography } from '@/constants/theme';
import { assertFirebaseConfigured } from '@/constants/config';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useSubscription();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === '(auth)';
    if (!user && !inAuth) {
      router.replace('/(auth)/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)/home');
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={errStyles.splash}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={errStyles.splashText}>Loading…</Text>
      </View>
    );
  }

  return <>{children}</>;
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
            </Stack>
          </AuthGate>
        </View>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}

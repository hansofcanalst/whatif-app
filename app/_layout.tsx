import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { ToastProvider } from '@/components/ui/Toast';
import { colors } from '@/constants/theme';

function AuthGate() {
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

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ToastProvider>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <AuthGate />
          <StatusBar style="light" />
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
        </View>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}

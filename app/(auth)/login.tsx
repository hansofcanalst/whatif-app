import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, Pressable, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { signInWithEmail, signInWithAppleIdToken } from '@/lib/auth';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function Login() {
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmail = async () => {
    if (!email || !password) return show('Enter email and password.', 'error');
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Sign in failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (cred.identityToken) {
        await signInWithAppleIdToken(cred.identityToken);
      }
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') show('Apple sign in failed.', 'error');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>What If</Text>
        <Text style={styles.tagline}>See yourself in a whole new way</Text>

        <View style={styles.form}>
          <TextInput
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
          />
          <Button label="Log in" onPress={handleEmail} loading={loading} />
        </View>

        {Platform.OS === 'ios' ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={999}
            style={styles.appleBtn}
            onPress={handleApple}
          />
        ) : null}

        <Link href="/(auth)/signup" asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkText}>
              No account? <Text style={styles.linkAccent}>Sign up</Text>
            </Text>
          </Pressable>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingTop: spacing.xxxl * 2,
    gap: spacing.xl,
    backgroundColor: colors.bg,
  },
  logo: { ...typography.display, color: colors.textPrimary, textAlign: 'center' },
  tagline: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  form: { gap: spacing.md, marginTop: spacing.xl },
  input: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    padding: spacing.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body,
  },
  appleBtn: { height: 48, width: '100%' },
  linkRow: { alignItems: 'center', padding: spacing.md },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkAccent: { color: colors.accent, fontWeight: '700' },
});

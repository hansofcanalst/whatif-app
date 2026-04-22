import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Platform, Pressable, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { signUpWithEmail } from '@/lib/auth';
import { colors, radii, spacing, typography } from '@/constants/theme';

export default function Signup() {
  const { show } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) return show('Fill all fields.', 'error');
    if (password !== confirm) return show('Passwords do not match.', 'error');
    if (password.length < 6) return show('Password must be at least 6 characters.', 'error');
    setLoading(true);
    try {
      await signUpWithEmail(email.trim(), password);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Sign up failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>Create account</Text>
        <Text style={styles.tagline}>Join the multiverse.</Text>

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
          <TextInput
            placeholder="Confirm password"
            placeholderTextColor={colors.textMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            style={styles.input}
          />
          <Button label="Sign up" onPress={handleSubmit} loading={loading} />
        </View>

        <Text style={styles.fine}>
          By signing up you agree to our Terms of Service and Privacy Policy.
        </Text>

        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkText}>
              Have an account? <Text style={styles.linkAccent}>Log in</Text>
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
  fine: { ...typography.tiny, color: colors.textMuted, textAlign: 'center' },
  linkRow: { alignItems: 'center', padding: spacing.md },
  linkText: { ...typography.body, color: colors.textSecondary },
  linkAccent: { color: colors.accent, fontWeight: '700' },
});

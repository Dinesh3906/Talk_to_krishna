import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store/auth.store';
import { darkTheme } from '../../theme/colors';

export default function LoginScreen() {
  const router = useRouter();
  const { login, register, loginAnonymous, isLoading, error } = useAuthStore();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }

    try {
      if (isRegistering) {
        await register(email, password, displayName.trim() || undefined);
      } else {
        await login(email, password);
      }
      router.replace('/chat');
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed. Please check your credentials.');
    }
  };

  const handleGuestEntry = async () => {
    setLocalError(null);
    try {
      await loginAnonymous();
      router.replace('/chat');
    } catch (err: any) {
      setLocalError(err.message || 'Unable to start guest session.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Classical Header */}
          <View style={styles.header}>
            <View style={styles.sacredBadge}>
              <Text style={styles.sacredOm}>ॐ</Text>
            </View>
            <Text style={styles.appTitle}>Talk to Krishna</Text>
            <Text style={styles.appTagline}>Timeless wisdom for the modern mind</Text>
          </View>

          {/* Simple Tab Switcher (Sign In / Sign Up) */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, !isRegistering && styles.tabButtonActive]}
              onPress={() => {
                setIsRegistering(false);
                setLocalError(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, !isRegistering && styles.tabTextActive]}>
                Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, isRegistering && styles.tabButtonActive]}
              onPress={() => {
                setIsRegistering(true);
                setLocalError(null);
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, isRegistering && styles.tabTextActive]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Error Message */}
          {(localError || error) && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError || error}</Text>
            </View>
          )}

          {/* Form Fields */}
          <View style={styles.formCard}>
            {isRegistering && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Your Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Arjuna"
                  placeholderTextColor={darkTheme.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="name@example.com"
                placeholderTextColor={darkTheme.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={darkTheme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {/* Primary Action Button */}
            <TouchableOpacity
              style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#0B0F19" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isRegistering ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Guest Quick Entry */}
            <TouchableOpacity
              style={styles.guestButton}
              onPress={handleGuestEntry}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <Text style={styles.guestButtonText}>Continue as Guest</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F19',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sacredBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  sacredOm: {
    fontSize: 34,
    color: darkTheme.primary,
    fontWeight: 'bold',
  },
  appTitle: {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  appTagline: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#131A2B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#1E293B',
  },
  tabText: {
    color: darkTheme.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#F8FAFC',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  formCard: {
    backgroundColor: '#131A2B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: darkTheme.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: '#0E1320',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    color: '#F8FAFC',
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  submitButton: {
    backgroundColor: darkTheme.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#0B0F19',
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1E293B',
  },
  dividerText: {
    color: darkTheme.textMuted,
    fontSize: 12,
    marginHorizontal: 12,
    textTransform: 'uppercase',
  },
  guestButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
});

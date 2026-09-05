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
import { getApiBaseUrl, setCustomApiUrl, checkBackendHealth } from '../../lib/api-client';

export default function LoginScreen() {
  const router = useRouter();
  const { login, register, loginAnonymous, isLoading, error } = useAuthStore();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const [showConfig, setShowConfig] = useState(false);
  const [currentApiUrl, setCurrentApiUrl] = useState(getApiBaseUrl());
  const [apiUrlInput, setApiUrlInput] = useState(getApiBaseUrl());
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [isTestingHealth, setIsTestingHealth] = useState(false);

  const handleTestAndSaveUrl = async () => {
    setIsTestingHealth(true);
    setHealthStatus('Testing connection...');
    const result = await checkBackendHealth(apiUrlInput);
    setIsTestingHealth(false);
    if (result.healthy) {
      setCustomApiUrl(apiUrlInput);
      setCurrentApiUrl(apiUrlInput.trim().replace(/\/+$/, ''));
      setHealthStatus(`✅ Connected to API. Database: ${result.database === 'connected' ? '✅ Connected' : '⚠️ Disconnected'}`);
      setLocalError(null);
    } else {
      setHealthStatus(`❌ Failed to connect: ${result.error || 'Server unreachable'}`);
    }
  };

  const handleSubmit = async () => {
    setLocalError(null);
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }

    try {
      if (isRegistering) {
        await register(email, password, displayName.trim() || undefined, preferredName.trim() || undefined);
      } else {
        await login(email, password);
      }
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err.message || 'Authentication failed.';
      if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) {
        setShowConfig(true);
        setLocalError(`Cannot reach API at ${currentApiUrl}. Please verify your Render URL below.`);
      } else {
        setLocalError(msg);
      }
    }
  };

  const handleAnonymousStart = async () => {
    setLocalError(null);
    try {
      await loginAnonymous();
      router.replace('/(tabs)');
    } catch (err: any) {
      const msg = err.message || 'Could not initiate session.';
      if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) {
        setShowConfig(true);
        setLocalError(`Cannot reach API at ${currentApiUrl}. Please verify your Render URL below.`);
      } else {
        setLocalError(msg);
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>{isRegistering ? 'Begin Your Walk' : 'Welcome Back'}</Text>
            <Text style={styles.subtitle}>
              {isRegistering
                ? 'Create a permanent sanctuary for your reflections.'
                : 'Return to your contemplation and conversations.'}
            </Text>
          </View>

          {(localError || error) && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError || error}</Text>
            </View>
          )}

          <View style={styles.form}>
            {isRegistering && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Your Name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Arjun"
                    placeholderTextColor={darkTheme.textMuted}
                    value={displayName}
                    onChangeText={setDisplayName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>How Krishna May Address You (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Your name, Mitra, or Sakha"
                    placeholderTextColor={darkTheme.textMuted}
                    value={preferredName}
                    onChangeText={setPreferredName}
                    autoCapitalize="words"
                  />
                </View>
              </>
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
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Minimum 8 characters"
                placeholderTextColor={darkTheme.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={isLoading}>
              {isLoading ? (
                <ActivityIndicator color="#0B0F19" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isRegistering ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {isRegistering ? 'Already have an account?' : 'First time here?'}
              </Text>
              <TouchableOpacity onPress={() => setIsRegistering(!isRegistering)}>
                <Text style={styles.toggleLink}>{isRegistering ? 'Sign In' : 'Create Account'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue without email</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.anonymousButton}
              onPress={handleAnonymousStart}
              disabled={isLoading}
            >
              <Text style={styles.anonymousButtonText}>Enter as Guest Seeker</Text>
            </TouchableOpacity>
            <Text style={styles.anonymousNotice}>
              Creates a private database record. You can link an email later.
            </Text>

            <View style={styles.endpointSection}>
              <TouchableOpacity
                style={styles.endpointBadge}
                onPress={() => setShowConfig(!showConfig)}
              >
                <Text style={styles.endpointBadgeText}>
                  API: <Text style={styles.endpointUrlHighlight}>{currentApiUrl}</Text>
                </Text>
                <Text style={styles.endpointToggleText}>{showConfig ? '▲ Hide' : '⚙ Configure'}</Text>
              </TouchableOpacity>

              {showConfig && (
                <View style={styles.configCard}>
                  <Text style={styles.configTitle}>Backend API Connection</Text>
                  <Text style={styles.configSubtitle}>
                    Point the app to your live Render backend service:
                  </Text>
                  <TextInput
                    style={styles.configInput}
                    value={apiUrlInput}
                    onChangeText={setApiUrlInput}
                    placeholder="https://your-service.onrender.com/api/v1"
                    placeholderTextColor={darkTheme.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTestAndSaveUrl}
                    disabled={isTestingHealth}
                  >
                    {isTestingHealth ? (
                      <ActivityIndicator size="small" color="#0B0F19" />
                    ) : (
                      <Text style={styles.testButtonText}>Save & Test Connection</Text>
                    )}
                  </TouchableOpacity>
                  {healthStatus && (
                    <Text style={styles.healthStatusText}>{healthStatus}</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    padding: 24,
    justifyContent: 'center',
    flexGrow: 1,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: darkTheme.textSecondary,
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: darkTheme.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: darkTheme.textPrimary,
    fontSize: 15,
  },
  primaryButton: {
    backgroundColor: darkTheme.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  primaryButtonText: {
    color: '#0B0F19',
    fontSize: 16,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  toggleText: {
    color: darkTheme.textSecondary,
    fontSize: 14,
  },
  toggleLink: {
    color: darkTheme.primaryLight,
    fontSize: 14,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: darkTheme.surfaceBorder,
  },
  dividerText: {
    color: darkTheme.textMuted,
    fontSize: 12,
    marginHorizontal: 12,
  },
  anonymousButton: {
    backgroundColor: darkTheme.surface,
    borderWidth: 1,
    borderColor: darkTheme.surfaceBorder,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  anonymousButtonText: {
    color: darkTheme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  anonymousNotice: {
    color: darkTheme.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  endpointSection: {
    marginTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 16,
  },
  endpointBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  endpointBadgeText: {
    fontSize: 12,
    color: darkTheme.textSecondary,
    flex: 1,
  },
  endpointUrlHighlight: {
    color: darkTheme.primaryLight,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  endpointToggleText: {
    fontSize: 12,
    color: darkTheme.primaryLight,
    fontWeight: '600',
    marginLeft: 8,
  },
  configCard: {
    marginTop: 12,
    backgroundColor: darkTheme.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkTheme.surfaceBorder,
  },
  configTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: darkTheme.textPrimary,
    marginBottom: 4,
  },
  configSubtitle: {
    fontSize: 12,
    color: darkTheme.textSecondary,
    marginBottom: 12,
    lineHeight: 16,
  },
  configInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: darkTheme.surfaceBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: darkTheme.textPrimary,
    fontSize: 13,
    marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  testButton: {
    backgroundColor: darkTheme.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#0B0F19',
    fontSize: 13,
    fontWeight: '700',
  },
  healthStatusText: {
    marginTop: 10,
    fontSize: 12,
    color: darkTheme.textPrimary,
    textAlign: 'center',
    lineHeight: 18,
  },
});

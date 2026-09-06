import React, { useState, useEffect } from 'react';
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
import { GoogleSignInButton } from '../../components/GoogleSignInButton';

type AuthMode = 'login' | 'signup' | 'verify_otp' | 'forgot_email' | 'forgot_reset';

export default function LoginScreen() {
  const router = useRouter();
  const {
    login,
    signup,
    verifyOtp,
    forgotPassword,
    resetPassword,
    resendOtp,
    loginAnonymous,
    loginWithGoogle,
    isLoading,
    error,
  } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleLoginSubmit = async () => {
    setLocalError(null);
    setInfoMessage(null);
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }

    try {
      await login(email, password);
      router.replace('/chat');
    } catch (err: any) {
      if (err.message?.includes('not verified') || err.message?.includes('ACCOUNT_NOT_VERIFIED')) {
        setInfoMessage('Please enter the verification code sent to your email.');
        setResendCooldown(60);
        setMode('verify_otp');
      } else {
        setLocalError(err.message || 'Authentication failed. Please check your credentials.');
      }
    }
  };

  const handleSignupSubmit = async () => {
    setLocalError(null);
    setInfoMessage(null);
    if (!email.trim() || !password.trim()) {
      setLocalError('Please enter both email and password.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }

    try {
      await signup(email, password, displayName.trim() || undefined);
      setInfoMessage(`A 6-digit verification code was sent to ${email.trim().toLowerCase()}.`);
      setResendCooldown(60);
      setMode('verify_otp');
    } catch (err: any) {
      setLocalError(err.message || 'Signup failed. Please try again.');
    }
  };

  const handleVerifyOtpSubmit = async () => {
    setLocalError(null);
    if (otpCode.trim().length !== 6) {
      setLocalError('Please enter the complete 6-digit verification code.');
      return;
    }

    try {
      await verifyOtp(email, otpCode.trim(), 'SIGNUP_VERIFICATION');
      router.replace('/chat');
    } catch (err: any) {
      setLocalError(err.message || 'Invalid or expired verification code.');
    }
  };

  const handleResendOtp = async (purpose: 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET' = 'SIGNUP_VERIFICATION') => {
    if (resendCooldown > 0) return;
    setLocalError(null);
    try {
      const res = await resendOtp(email, purpose);
      setInfoMessage(res.message || 'New verification code sent.');
      setResendCooldown(60);
    } catch (err: any) {
      setLocalError(err.message || 'Unable to resend code right now.');
    }
  };

  const handleForgotPasswordSubmit = async () => {
    setLocalError(null);
    setInfoMessage(null);
    if (!email.trim()) {
      setLocalError('Please enter your account email.');
      return;
    }

    try {
      const res = await forgotPassword(email);
      setInfoMessage(res.message);
      setResendCooldown(60);
      setMode('forgot_reset');
    } catch (err: any) {
      setLocalError(err.message || 'Unable to process request.');
    }
  };

  const handleResetPasswordSubmit = async () => {
    setLocalError(null);
    if (otpCode.trim().length !== 6) {
      setLocalError('Please enter the complete 6-digit verification code.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setLocalError('New password must be at least 8 characters long.');
      return;
    }

    try {
      const res = await resetPassword(email, otpCode.trim(), newPassword);
      setInfoMessage(res.message);
      setOtpCode('');
      setNewPassword('');
      setPassword('');
      setMode('login');
    } catch (err: any) {
      setLocalError(err.message || 'Password reset failed.');
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

  const handleGoogleSuccess = async (idToken: string) => {
    setLocalError(null);
    try {
      await loginWithGoogle(idToken);
      router.replace('/chat');
    } catch (err: any) {
      setLocalError(err.message || 'Google authentication failed.');
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

          {/* Mode Switcher Tabs (Only in standard login/signup mode) */}
          {(mode === 'login' || mode === 'signup') && (
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, mode === 'login' && styles.tabButtonActive]}
                onPress={() => {
                  setMode('login');
                  setLocalError(null);
                  setInfoMessage(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, mode === 'signup' && styles.tabButtonActive]}
                onPress={() => {
                  setMode('signup');
                  setLocalError(null);
                  setInfoMessage(null);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Informational Message */}
          {infoMessage && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>{infoMessage}</Text>
            </View>
          )}

          {/* Error Message */}
          {(localError || error) && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{localError || error}</Text>
            </View>
          )}

          {/* FORM: Standard Login / Signup */}
          {(mode === 'login' || mode === 'signup') && (
            <View style={styles.formCard}>
              {mode === 'signup' && (
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
                <View style={styles.labelRow}>
                  <Text style={styles.inputLabel}>Password</Text>
                  {mode === 'login' && (
                    <TouchableOpacity
                      onPress={() => {
                        setMode('forgot_email');
                        setLocalError(null);
                        setInfoMessage(null);
                      }}
                    >
                      <Text style={styles.forgotLink}>Forgot Password?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={darkTheme.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={mode === 'signup' ? handleSignupSubmit : handleLoginSubmit}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#0B0F19" />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {mode === 'signup' ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.dividerLine} />
              </View>

              <GoogleSignInButton
                onSuccess={handleGoogleSuccess}
                onError={(err) => setLocalError(err)}
                disabled={isLoading}
              />

              <TouchableOpacity
                style={styles.guestButton}
                onPress={handleGuestEntry}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.guestButtonText}>Continue as Guest</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* FORM: OTP Verification View */}
          {mode === 'verify_otp' && (
            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>Verify Your Email</Text>
              <Text style={styles.cardSubtitle}>
                Enter the 6-digit code sent to <Text style={styles.highlightText}>{email}</Text>
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification Code</Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="123456"
                  placeholderTextColor={darkTheme.textMuted}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleVerifyOtpSubmit}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#0B0F19" />
                ) : (
                  <Text style={styles.submitButtonText}>Verify & Enter Sanctuary</Text>
                )}
              </TouchableOpacity>

              <View style={styles.resendRow}>
                <TouchableOpacity
                  onPress={() => handleResendOtp('SIGNUP_VERIFICATION')}
                  disabled={resendCooldown > 0 || isLoading}
                >
                  <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                    {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setMode('signup');
                    setLocalError(null);
                    setInfoMessage(null);
                  }}
                >
                  <Text style={styles.backLink}>Change Email</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* FORM: Forgot Password - Step 1 Email */}
          {mode === 'forgot_email' && (
            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>Reset Password</Text>
              <Text style={styles.cardSubtitle}>
                Enter your account email to receive a password reset code.
              </Text>

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

              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleForgotPasswordSubmit}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#0B0F19" />
                ) : (
                  <Text style={styles.submitButtonText}>Send Reset Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setMode('login');
                  setLocalError(null);
                  setInfoMessage(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* FORM: Forgot Password - Step 2 Code & New Password */}
          {mode === 'forgot_reset' && (
            <View style={styles.formCard}>
              <Text style={styles.cardTitle}>Set New Password</Text>
              <Text style={styles.cardSubtitle}>
                Enter the code sent to <Text style={styles.highlightText}>{email}</Text> along with your new password.
              </Text>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Verification Code</Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="123456"
                  placeholderTextColor={darkTheme.textMuted}
                  value={otpCode}
                  onChangeText={setOtpCode}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>New Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="At least 8 characters"
                  placeholderTextColor={darkTheme.textMuted}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleResetPasswordSubmit}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#0B0F19" />
                ) : (
                  <Text style={styles.submitButtonText}>Update Password & Sign In</Text>
                )}
              </TouchableOpacity>

              <View style={styles.resendRow}>
                <TouchableOpacity
                  onPress={() => handleResendOtp('PASSWORD_RESET')}
                  disabled={resendCooldown > 0 || isLoading}
                >
                  <Text style={[styles.resendText, resendCooldown > 0 && styles.resendTextDisabled]}>
                    {resendCooldown > 0 ? `Resend Code in ${resendCooldown}s` : 'Resend Code'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setMode('login');
                    setLocalError(null);
                  }}
                >
                  <Text style={styles.backLink}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sacredBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  sacredOm: {
    fontSize: 32,
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
    marginBottom: 16,
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
    borderWidth: 1,
    borderColor: darkTheme.primary,
  },
  tabText: {
    color: darkTheme.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: darkTheme.primary,
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  infoText: {
    color: '#93C5FD',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: '#131A2B',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E293B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTitle: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  cardSubtitle: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  highlightText: {
    color: darkTheme.primary,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    color: darkTheme.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 6,
  },
  forgotLink: {
    color: darkTheme.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#0B0F19',
    borderWidth: 1,
    borderColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#F8FAFC',
    fontSize: 15,
  },
  otpInput: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
    paddingVertical: 14,
  },
  submitButton: {
    backgroundColor: darkTheme.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
    marginBottom: 14,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#0B0F19',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1E293B',
  },
  dividerText: {
    color: darkTheme.textMuted,
    fontSize: 12,
    paddingHorizontal: 12,
  },
  guestButton: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: 'transparent',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: {
    color: darkTheme.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  resendText: {
    color: darkTheme.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  resendTextDisabled: {
    color: darkTheme.textMuted,
  },
  backLink: {
    color: darkTheme.textSecondary,
    fontSize: 13,
  },
  cancelButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: darkTheme.textSecondary,
    fontSize: 13,
  },
});

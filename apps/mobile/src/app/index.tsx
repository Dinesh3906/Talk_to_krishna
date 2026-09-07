import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/auth.store';
import { darkTheme } from '../theme/colors';
import { KrishnaAvatar } from '../components/KrishnaAvatar';

export default function SplashScreen() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (token) {
        router.replace('/chat');
      } else {
        router.replace('/(auth)/onboarding');
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [token]);

  return (
    <View style={styles.container}>
      <View style={styles.lotusCircle}>
        <KrishnaAvatar size={90} />
      </View>
      <Text style={styles.title}>Talk to Krishna</Text>
      <Text style={styles.subtitle}>Timeless wisdom for the modern mind</Text>
      <ActivityIndicator size="small" color={darkTheme.primary} style={styles.loader} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lotusCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: darkTheme.surface,
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  omSymbol: {
    fontSize: 44,
    color: darkTheme.primary,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: darkTheme.textPrimary,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: darkTheme.textSecondary,
    textAlign: 'center',
  },
  loader: {
    marginTop: 40,
  },
});
